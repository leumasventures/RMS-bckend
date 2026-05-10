'use strict';

/**
 * resultController.js — Sacred Heart College (SAHARCO)
 *
 * Routes (wired in resultRoutes.js):
 *   GET   /api/results                                           getAll
 *   GET   /api/results/stats                                     getStats
 *   GET   /api/results/report-card/:studentId                    getReportCard
 *   GET   /api/results/:id                                       getOne
 *   POST  /api/results                                           create
 *   POST  /api/results/bulk                                      bulkCreate
 *   PUT   /api/results/:id                                       update
 *   DELETE /api/results/:id                                      remove
 *   GET   /api/results/allocations/class/:class/:arm             getClassAllocation
 *   PUT   /api/results/allocations/class/:class/:arm             setClassAllocation
 *   DELETE /api/results/allocations/class/:class/:arm            clearClassAllocation
 *   GET   /api/results/allocations/student/:studentId            getStudentAllocation
 *   PUT   /api/results/allocations/student/:studentId            setStudentAllocation
 *   POST  /api/results/allocations/bulk-student                  bulkSetStudentAllocations
 *
 * Changes from document-13 original:
 *  1. gradeOf thresholds fixed to match the stated school scale:
 *     A≥70, B≥60, C≥50, D≥45, E≥40, F<40  (document-13 had B at 70, no E).
 *  2. Teacher access in getAll now respects missing assignedArm (form-master)
 *     — consistent with attendanceController.
 *  3. getStats: Teacher guard uses canEditClass so a form-master without an
 *     assigned arm can still pull stats for their whole class.
 *  4. create / bulkCreate: ss2/ss3 cap check moved BEFORE upsert call.
 *  5. enrichResult always returns letter + remark fields so the frontend
 *     smRenderResults() doesn't need a separate grade lookup.
 *  6. All responses unified to { success, data, ...meta } shape.
 *  7. allocStore() initialised safely — db.subjectAllocations may be absent.
 *  8. Minor: 'term' and 'session' field aliases accepted in getAll (termId /
 *     sessionId) so the filter works whether api-bridge sends the short or
 *     long form.
 */

const db = require('../config/db');

/* ─── constants ─────────────────────────────────────────────────────────── */

const MAX_SUBJECTS_SS23     = 9;
const SS_INDIVIDUAL_CLASSES = ['SS 2', 'SS 3'];

/* ─── helpers ────────────────────────────────────────────────────────────── */

const fail = (res, status, msg, extra = {}) =>
  res.status(status).json({ success: false, message: msg, ...extra });

const ok = (res, data, meta = {}, status = 200) =>
  res.status(status).json({ success: true, ...meta, data });

/**
 * 6-tier grading — A/B/C/D/E/F  matching SAHARCO school standard.
 * Thresholds match what checkResultController and reportCardController use.
 */
function gradeOf(total) {
  if (total >= 70) return { letter:'A', remark:'Excellent'  };
  if (total >= 60) return { letter:'B', remark:'Very Good'  };
  if (total >= 50) return { letter:'C', remark:'Good'       };
  if (total >= 45) return { letter:'D', remark:'Pass'       };
  if (total >= 40) return { letter:'E', remark:'Weak Pass'  };
  return               { letter:'F', remark:'Fail'       };
}

function enrichResult(r) {
  return { ...r, ...gradeOf(r.total) };
}

/**
 * Permission — Admin has full access; Teacher only edits their assigned class.
 * Missing assignedArm → form-master pattern (full class access).
 */
function canEditClass(user, cls, arm) {
  if (user.role === 'Admin') return true;
  return (
    user.role === 'Teacher' &&
    user.assignedClass === cls &&
    (!user.assignedArm || user.assignedArm === arm)
  );
}

function validateScores(ca, exam) {
  const caNum   = Number(ca);
  const examNum = Number(exam);
  if (isNaN(caNum)   || caNum   < 0 || caNum   > 40) return 'CA score must be between 0 and 40.';
  if (isNaN(examNum) || examNum < 0 || examNum > 60) return 'Exam score must be between 0 and 60.';
  return null;
}

/**
 * SS2/SS3 subject cap — returns an error string or null.
 * Called BEFORE the upsert so we don't persist then roll back.
 */
function checkSubjectLimit(studentId, subject, term, session) {
  const student = db.findStudent(studentId);
  if (!student || !SS_INDIVIDUAL_CLASSES.includes(student.class)) return null;
  // Allow update of an existing record
  const alreadyHas = !!(db.findResult && db.findResult(studentId, subject, term, session));
  if (alreadyHas) return null;
  const count = db.countSubjectsForStudent
    ? db.countSubjectsForStudent(studentId, term, session)
    : (db.results || []).filter(r => r.studentId === studentId && r.term === term && r.session === session).length;
  if (count >= MAX_SUBJECTS_SS23)
    return `Student ${studentId} has already registered ${MAX_SUBJECTS_SS23} subjects for ${term} ${session} (SS2/SS3 maximum).`;
  return null;
}

function allocStore() {
  if (!db.subjectAllocations) db.subjectAllocations = {};
  return db.subjectAllocations;
}

/* ═══════════════════════════════════════════════════════════════════════════
   GET /api/results
   Query: studentId, class, arm, subject, term (or termId), session (or sessionId)
═══════════════════════════════════════════════════════════════════════════ */
exports.getAll = (req, res) => {
  const {
    studentId,
    class: cls, arm,
    subject,
    term,      termId,
    session,   sessionId,
  } = req.query;

  const termVal    = term    || termId;
  const sessionVal = session || sessionId;

  // Parent — own ward only
  if (req.user.role === 'Parent') {
    const data = (db.results || [])
      .filter(r => r.studentId === req.user.wardId)
      .map(enrichResult);
    return ok(res, data, { total: data.length });
  }

  let list = [...(db.results || [])];

  // Teacher — restricted to assigned class (all arms if no arm assigned)
  if (req.user.role === 'Teacher') {
    list = list.filter(r =>
      r.class === req.user.assignedClass &&
      (!req.user.assignedArm || r.arm === req.user.assignedArm)
    );
  }

  if (studentId)  list = list.filter(r => r.studentId === studentId);
  if (cls)        list = list.filter(r => r.class     === cls);
  if (arm)        list = list.filter(r => r.arm       === arm);
  if (subject)    list = list.filter(r => r.subject   === subject);
  if (termVal)    list = list.filter(r => r.term      === termVal);
  if (sessionVal) list = list.filter(r => r.session   === sessionVal);

  return ok(res, list.map(enrichResult), { total: list.length });
};

/* ═══════════════════════════════════════════════════════════════════════════
   GET /api/results/:id
═══════════════════════════════════════════════════════════════════════════ */
exports.getOne = (req, res) => {
  const result = (db.results || []).find(r => r.id === Number(req.params.id));
  if (!result) return fail(res, 404, 'Result not found.');

  if (req.user.role === 'Parent' && result.studentId !== req.user.wardId)
    return fail(res, 403, 'Access denied.');
  if (req.user.role === 'Teacher' && !canEditClass(req.user, result.class, result.arm))
    return fail(res, 403, 'Access denied.');

  return ok(res, enrichResult(result));
};

/* ═══════════════════════════════════════════════════════════════════════════
   GET /api/results/report-card/:studentId
   Query: term, session
═══════════════════════════════════════════════════════════════════════════ */
exports.getReportCard = (req, res) => {
  const { studentId }     = req.params;
  const { term, session } = req.query;

  if (req.user.role === 'Parent' && req.user.wardId !== studentId)
    return fail(res, 403, 'Access denied.');

  const student = db.findStudent(studentId);
  if (!student) return fail(res, 404, `Student "${studentId}" not found.`);

  let rows = (db.results || []).filter(r => r.studentId === studentId);
  if (term)    rows = rows.filter(r => r.term    === term);
  if (session) rows = rows.filter(r => r.session === session);

  const enriched   = rows.map(enrichResult);
  const totalScore = enriched.reduce((s, r) => s + r.total, 0);
  const average    = enriched.length ? parseFloat((totalScore / enriched.length).toFixed(1)) : null;

  return ok(res, {
    student,
    term:    term    || 'All',
    session: session || 'All',
    results: enriched,
    summary: {
      subjectCount:  enriched.length,
      totalScore,
      average,
      overallGrade:  average != null ? gradeOf(average).letter : null,
      overallRemark: average != null ? gradeOf(average).remark : null,
    },
  });
};

/* ═══════════════════════════════════════════════════════════════════════════
   GET /api/results/stats
   Query: class, arm, term, session
═══════════════════════════════════════════════════════════════════════════ */
exports.getStats = (req, res) => {
  const { class: cls, arm, term, session } = req.query;

  // Teacher guard uses canEditClass (allows form-master without assignedArm)
  if (req.user.role === 'Teacher' && !canEditClass(req.user, cls, arm))
    return fail(res, 403, 'Access denied.');

  let list = [...(db.results || [])];
  if (cls)     list = list.filter(r => r.class   === cls);
  if (arm)     list = list.filter(r => r.arm     === arm);
  if (term)    list = list.filter(r => r.term    === term);
  if (session) list = list.filter(r => r.session === session);

  if (!list.length)
    return ok(res, null, { message: 'No results found for the given filters.' });

  const totals  = list.map(r => r.total);
  const avg     = totals.reduce((a, b) => a + b, 0) / totals.length;
  const passing = list.filter(r => r.total >= 40).length;

  const gradeDist = { A:0, B:0, C:0, D:0, E:0, F:0 };
  list.forEach(r => { gradeDist[gradeOf(r.total).letter]++; });

  const bySubject = {};
  list.forEach(r => {
    if (!bySubject[r.subject]) bySubject[r.subject] = [];
    bySubject[r.subject].push(r.total);
  });
  const subjectAverages = Object.entries(bySubject)
    .map(([subject, scores]) => ({
      subject,
      average: parseFloat((scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1)),
      count:   scores.length,
      highest: Math.max(...scores),
      lowest:  Math.min(...scores),
    }))
    .sort((a, b) => b.average - a.average);

  return ok(res, {
    filters:    { class: cls, arm, term, session },
    total:      list.length,
    average:    parseFloat(avg.toFixed(1)),
    highest:    Math.max(...totals),
    lowest:     Math.min(...totals),
    passing,
    failing:    list.length - passing,
    passRate:   parseFloat(((passing / list.length) * 100).toFixed(1)),
    gradeDist,
    subjectAverages,
  });
};

/* ═══════════════════════════════════════════════════════════════════════════
   POST /api/results  — single entry
   Body: { studentId, class, arm, subject, term, session, ca, exam }
═══════════════════════════════════════════════════════════════════════════ */
exports.create = (req, res) => {
  const { studentId, class: cls, arm, subject, term, session, ca, exam } = req.body;

  const missing = ['studentId','class','arm','subject','term','session','ca','exam']
    .filter(f => req.body[f] === undefined || req.body[f] === '');
  if (missing.length) return fail(res, 400, `Missing required fields: ${missing.join(', ')}.`);

  if (!canEditClass(req.user, cls, arm))
    return fail(res, 403, 'You can only enter results for your assigned class.');

  if (!db.findStudent(studentId))
    return fail(res, 404, `Student "${studentId}" not found.`);

  const scoreError = validateScores(ca, exam);
  if (scoreError) return fail(res, 400, scoreError);

  // Subject cap checked BEFORE upsert
  const limitError = checkSubjectLimit(studentId, subject, term, session);
  if (limitError) return fail(res, 400, limitError);

  const caNum = Number(ca);
  const exNum = Number(exam);
  const total = Math.min(caNum + exNum, 100);

  const saved = db.upsertResult({ studentId, class: cls, arm, subject, term, session, ca: caNum, exam: exNum, total });
  return ok(res, enrichResult(saved), {}, 201);
};

/* ═══════════════════════════════════════════════════════════════════════════
   POST /api/results/bulk
   Body: { class, arm, term, session, rows: [{ studentId, subject, ca, exam }] }
═══════════════════════════════════════════════════════════════════════════ */
exports.bulkCreate = (req, res) => {
  const { class: cls, arm, term, session, rows } = req.body;

  if (!cls || !arm || !term || !session) return fail(res, 400, 'class, arm, term, and session are required.');
  if (!Array.isArray(rows) || !rows.length) return fail(res, 400, 'rows must be a non-empty array.');

  if (!canEditClass(req.user, cls, arm))
    return fail(res, 403, 'You can only enter results for your assigned class.');

  const saved = [], errors = [];

  rows.forEach((row, i) => {
    const label   = `Row ${i + 1}`;
    const { studentId, subject, ca, exam } = row;

    const missing = ['studentId','subject','ca','exam'].filter(f => row[f] === undefined || row[f] === '');
    if (missing.length) { errors.push({ row: label, reason: `Missing: ${missing.join(', ')}.` }); return; }
    if (!db.findStudent(studentId)) { errors.push({ row: label, reason: `Student "${studentId}" not found.` }); return; }

    const scoreError = validateScores(ca, exam);
    if (scoreError) { errors.push({ row: label, reason: scoreError }); return; }

    const limitError = checkSubjectLimit(studentId, subject, term, session);
    if (limitError) { errors.push({ row: label, reason: limitError }); return; }

    const caNum = Number(ca), exNum = Number(exam);
    const entry = db.upsertResult({ studentId, class: cls, arm, subject, term, session, ca: caNum, exam: exNum, total: Math.min(caNum + exNum, 100) });
    saved.push(enrichResult(entry));
  });

  return res.status(saved.length ? 207 : 400).json({
    success: saved.length > 0,
    saved:   saved.length,
    errors:  errors.length,
    data:    saved,
    issues:  errors,
  });
};

/* ═══════════════════════════════════════════════════════════════════════════
   PUT /api/results/:id
═══════════════════════════════════════════════════════════════════════════ */
exports.update = (req, res) => {
  const id  = Number(req.params.id);
  const idx = (db.results || []).findIndex(r => r.id === id);
  if (idx < 0) return fail(res, 404, 'Result not found.');

  const existing = db.results[idx];
  if (!canEditClass(req.user, existing.class, existing.arm))
    return fail(res, 403, 'You can only edit results for your assigned class.');

  const ca   = req.body.ca   !== undefined ? req.body.ca   : existing.ca;
  const exam = req.body.exam !== undefined ? req.body.exam : existing.exam;

  const scoreError = validateScores(ca, exam);
  if (scoreError) return fail(res, 400, scoreError);

  const caNum = Number(ca), exNum = Number(exam);
  db.results[idx] = { ...existing, ca: caNum, exam: exNum, total: Math.min(caNum + exNum, 100) };
  return ok(res, enrichResult(db.results[idx]));
};

/* ═══════════════════════════════════════════════════════════════════════════
   DELETE /api/results/:id  — Admin only
═══════════════════════════════════════════════════════════════════════════ */
exports.remove = (req, res) => {
  const id  = Number(req.params.id);
  const idx = (db.results || []).findIndex(r => r.id === id);
  if (idx < 0) return fail(res, 404, 'Result not found.');

  const [removed] = db.results.splice(idx, 1);
  return ok(res, removed, { message: 'Result deleted.' });
};

/* ═══════════════════════════════════════════════════════════════════════════
   SUBJECT ALLOCATIONS
═══════════════════════════════════════════════════════════════════════════ */

exports.getClassAllocation = (req, res) => {
  const { class: cls, arm } = req.params;
  if (req.user.role === 'Teacher' && !canEditClass(req.user, cls, arm))
    return fail(res, 403, 'Access denied.');
  const allocated = allocStore()[`${cls}_${arm}`] || [];
  return ok(res, { class: cls, arm, subjects: allocated });
};

exports.setClassAllocation = (req, res) => {
  const { class: cls, arm } = req.params;
  const { subjects } = req.body;
  if (!canEditClass(req.user, cls, arm)) return fail(res, 403, 'Access denied.');
  if (!Array.isArray(subjects)) return fail(res, 400, 'subjects must be an array.');
  allocStore()[`${cls}_${arm}`] = subjects;
  return ok(res, { class: cls, arm, subjects });
};

exports.clearClassAllocation = (req, res) => {
  const { class: cls, arm } = req.params;
  allocStore()[`${cls}_${arm}`] = [];
  return ok(res, null, { message: `Allocation cleared for ${cls} ${arm}.` });
};

exports.getStudentAllocation = (req, res) => {
  const { studentId } = req.params;
  if (req.user.role === 'Parent' && req.user.wardId !== studentId)
    return fail(res, 403, 'Access denied.');
  const student = db.findStudent(studentId);
  if (!student) return fail(res, 404, `Student "${studentId}" not found.`);
  if (!SS_INDIVIDUAL_CLASSES.includes(student.class))
    return fail(res, 400, `Per-student allocation only applies to SS2/SS3. ${student.name} is in ${student.class}.`);
  return ok(res, { studentId, subjects: allocStore()[studentId] || [] });
};

exports.setStudentAllocation = (req, res) => {
  const { studentId } = req.params;
  const { subjects }  = req.body;
  const student = db.findStudent(studentId);
  if (!student) return fail(res, 404, `Student "${studentId}" not found.`);
  if (!SS_INDIVIDUAL_CLASSES.includes(student.class))
    return fail(res, 400, 'Per-student allocation only applies to SS2/SS3 students.');
  if (!Array.isArray(subjects)) return fail(res, 400, 'subjects must be an array.');
  if (subjects.length > MAX_SUBJECTS_SS23)
    return fail(res, 400, `SS2/SS3 students may not register more than ${MAX_SUBJECTS_SS23} subjects.`);
  if (!canEditClass(req.user, student.class, student.arm))
    return fail(res, 403, 'Access denied.');
  allocStore()[studentId] = subjects;
  return ok(res, { studentId, subjects });
};

exports.bulkSetStudentAllocations = (req, res) => {
  const { class: cls, arm, subjects } = req.body;
  if (!cls || !arm) return fail(res, 400, 'class and arm are required.');
  if (!SS_INDIVIDUAL_CLASSES.includes(cls))
    return fail(res, 400, 'Bulk per-student allocation only applies to SS2/SS3.');
  if (!canEditClass(req.user, cls, arm)) return fail(res, 403, 'Access denied.');
  if (!Array.isArray(subjects) || !subjects.length) return fail(res, 400, 'subjects must be a non-empty array.');
  if (subjects.length > MAX_SUBJECTS_SS23)
    return fail(res, 400, `Cannot allocate more than ${MAX_SUBJECTS_SS23} subjects per student.`);

  const students = (db.students || []).filter(s => s.class === cls && s.arm === arm && s.active !== false);
  if (!students.length) return fail(res, 404, `No students found in ${cls} ${arm}.`);

  const store = allocStore();
  students.forEach(s => { store[s.id] = [...subjects]; });

  return ok(res, { class: cls, arm, subjects, studentsUpdated: students.length }, {
    message: `${subjects.length} subjects allocated to ${students.length} students in ${cls} ${arm}.`,
  });
};