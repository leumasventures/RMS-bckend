'use strict';

const db = require('../config/db');

const MAX_SUBJECTS_SS23 = 9;

/* ── SHARED HELPERS ──────────────────────── */
function gradeOf(total) {
  if (total >= 70) return { letter: 'A', remark: 'Excellent' };
  if (total >= 60) return { letter: 'B', remark: 'Very Good' };
  if (total >= 50) return { letter: 'C', remark: 'Good'      };
  if (total >= 45) return { letter: 'D', remark: 'Pass'      };
  if (total >= 40) return { letter: 'E', remark: 'Weak Pass' };
  return                   { letter: 'F', remark: 'Fail'     };
}

function canEditClass(user, cls, arm) {
  if (user.role === 'Admin') return true;
  return user.role === 'Teacher' &&
    user.assignedClass === cls   &&
    user.assignedArm   === arm;
}

function validateScores(ca, exam) {
  const caNum   = Number(ca);
  const examNum = Number(exam);
  if (isNaN(caNum)   || caNum   < 0 || caNum   > 40) return 'CA score must be between 0 and 40.';
  if (isNaN(examNum) || examNum < 0 || examNum > 60) return 'Exam score must be between 0 and 60.';
  return null; // valid
}

function checkSubjectLimit(studentId, subject, term, session) {
  const student = db.findStudent(studentId);
  if (!student || !['SS 2', 'SS 3'].includes(student.class)) return null;
  const alreadyHas = !!db.findResult(studentId, subject, term, session);
  if (alreadyHas) return null; // updating existing — no limit issue
  const count = db.countSubjectsForStudent(studentId, term, session);
  if (count >= MAX_SUBJECTS_SS23) {
    return `Student ${studentId} has already registered ${MAX_SUBJECTS_SS23} subjects for ${term} ${session} (SS2/SS3 maximum).`;
  }
  return null;
}

function enrichResult(r) {
  return { ...r, ...gradeOf(r.total) };
}

/* ── GET /api/results ───────────────────────
   Query: studentId, class, arm, subject, term, session
─────────────────────────────────────────── */
exports.getAll = (req, res) => {
  const { studentId, class: cls, arm, subject, term, session } = req.query;

  // Parent: own ward only
  if (req.user.role === 'Parent') {
    const data = db.results
      .filter(r => r.studentId === req.user.wardId)
      .map(enrichResult);
    return res.json({ success: true, data, total: data.length });
  }

  let list = [...db.results];

  // Teacher: restricted to assigned class/arm
  if (req.user.role === 'Teacher') {
    list = list.filter(r =>
      r.class === req.user.assignedClass &&
      r.arm   === req.user.assignedArm
    );
  }

  // Apply optional filters
  if (studentId) list = list.filter(r => r.studentId === studentId);
  if (cls)       list = list.filter(r => r.class     === cls);
  if (arm)       list = list.filter(r => r.arm       === arm);
  if (subject)   list = list.filter(r => r.subject   === subject);
  if (term)      list = list.filter(r => r.term      === term);
  if (session)   list = list.filter(r => r.session   === session);

  return res.json({
    success: true,
    data:    list.map(enrichResult),
    total:   list.length,
  });
};

/* ── GET /api/results/report-card/:studentId */
exports.getReportCard = (req, res) => {
  const { studentId } = req.params;
  const { term, session } = req.query;

  // Parent can only view their own ward's card
  if (req.user.role === 'Parent' && req.user.wardId !== studentId) {
    return res.status(403).json({ success: false, message: 'Access denied.' });
  }

  const student = db.findStudent(studentId);
  if (!student) {
    return res.status(404).json({ success: false, message: `Student "${studentId}" not found.` });
  }

  let rows = db.results.filter(r => r.studentId === studentId);
  if (term)    rows = rows.filter(r => r.term    === term);
  if (session) rows = rows.filter(r => r.session === session);

  const enriched  = rows.map(enrichResult);
  const totalScore = enriched.reduce((sum, r) => sum + r.total, 0);
  const average    = enriched.length ? parseFloat((totalScore / enriched.length).toFixed(1)) : null;

  return res.json({
    success: true,
    data: {
      student,
      term:    term    || 'All',
      session: session || 'All',
      results: enriched,
      summary: {
        subjectCount: enriched.length,
        totalScore,
        average,
        overallGrade: average != null ? gradeOf(average).letter : null,
        overallRemark: average != null ? gradeOf(average).remark : null,
      },
    },
  });
};

/* ── POST /api/results ── single entry ──────
   Body: { studentId, class, arm, subject, term, session, ca, exam }
─────────────────────────────────────────── */
exports.create = (req, res) => {
  const { studentId, class: cls, arm, subject, term, session, ca, exam } = req.body;

  // Required-fields check
  const missing = ['studentId', 'class', 'arm', 'subject', 'term', 'session', 'ca', 'exam']
    .filter(f => req.body[f] === undefined || req.body[f] === '');
  if (missing.length) {
    return res.status(400).json({ success: false, message: `Missing required fields: ${missing.join(', ')}.` });
  }

  // Permission
  if (!canEditClass(req.user, cls, arm)) {
    return res.status(403).json({ success: false, message: 'You can only enter results for your assigned class.' });
  }

  // Student exists?
  if (!db.findStudent(studentId)) {
    return res.status(404).json({ success: false, message: `Student "${studentId}" not found.` });
  }

  // Score range
  const scoreError = validateScores(ca, exam);
  if (scoreError) return res.status(400).json({ success: false, message: scoreError });

  // SS2/SS3 subject limit
  const limitError = checkSubjectLimit(studentId, subject, term, session);
  if (limitError) return res.status(400).json({ success: false, message: limitError });

  const caNum  = Number(ca);
  const exNum  = Number(exam);
  const total  = Math.min(caNum + exNum, 100);
  const saved  = db.upsertResult({ studentId, class: cls, arm, subject, term, session, ca: caNum, exam: exNum, total });

  return res.status(201).json({ success: true, data: enrichResult(saved) });
};

/* ── POST /api/results/bulk ─────────────────
   Body: { class, arm, term, session,
           rows: [{ studentId, subject, ca, exam }] }
─────────────────────────────────────────── */
exports.bulkCreate = (req, res) => {
  const { class: cls, arm, term, session, rows } = req.body;

  if (!cls || !arm || !term || !session) {
    return res.status(400).json({ success: false, message: 'class, arm, term, and session are required.' });
  }
  if (!Array.isArray(rows) || rows.length === 0) {
    return res.status(400).json({ success: false, message: 'rows[] must be a non-empty array.' });
  }

  if (!canEditClass(req.user, cls, arm)) {
    return res.status(403).json({ success: false, message: 'You can only enter results for your assigned class.' });
  }

  const saved  = [];
  const errors = [];

  rows.forEach((row, i) => {
    const label = `Row ${i + 1}`;
    const { studentId, subject, ca, exam } = row;

    // Basic presence
    const missing = ['studentId', 'subject', 'ca', 'exam'].filter(f => row[f] === undefined || row[f] === '');
    if (missing.length) {
      errors.push({ row: label, reason: `Missing: ${missing.join(', ')}.` });
      return;
    }

    // Student exists?
    if (!db.findStudent(studentId)) {
      errors.push({ row: label, reason: `Student "${studentId}" not found.` });
      return;
    }

    // Score ranges
    const scoreError = validateScores(ca, exam);
    if (scoreError) { errors.push({ row: label, reason: scoreError }); return; }

    // Subject limit
    const limitError = checkSubjectLimit(studentId, subject, term, session);
    if (limitError)  { errors.push({ row: label, reason: limitError }); return; }

    const caNum = Number(ca);
    const exNum = Number(exam);
    const total = Math.min(caNum + exNum, 100);
    const entry = db.upsertResult({ studentId, class: cls, arm, subject, term, session, ca: caNum, exam: exNum, total });
    saved.push(enrichResult(entry));
  });

  // 207 Multi-Status when partial success; 400 when nothing saved
  const status = saved.length === 0 ? 400 : 207;
  return res.status(status).json({
    success:   saved.length > 0,
    saved:     saved.length,
    errors:    errors.length,
    data:      saved,
    issues:    errors,
  });
};

/* ── PUT /api/results/:id ────────────────────
   Allows patching ca/exam scores on an existing result.
─────────────────────────────────────────── */
exports.update = (req, res) => {
  const id  = Number(req.params.id);
  const idx = db.results.findIndex(r => r.id === id);
  if (idx < 0) {
    return res.status(404).json({ success: false, message: 'Result not found.' });
  }

  const existing = db.results[idx];

  if (!canEditClass(req.user, existing.class, existing.arm)) {
    return res.status(403).json({ success: false, message: 'You can only edit results for your assigned class.' });
  }

  const ca   = req.body.ca   !== undefined ? req.body.ca   : existing.ca;
  const exam = req.body.exam !== undefined ? req.body.exam : existing.exam;

  const scoreError = validateScores(ca, exam);
  if (scoreError) return res.status(400).json({ success: false, message: scoreError });

  const caNum  = Number(ca);
  const exNum  = Number(exam);
  const total  = Math.min(caNum + exNum, 100);

  db.results[idx] = { ...existing, ca: caNum, exam: exNum, total };
  return res.json({ success: true, data: enrichResult(db.results[idx]) });
};

/* ── DELETE /api/results/:id ─── Admin only── */
exports.remove = (req, res) => {
  const id  = Number(req.params.id);
  const idx = db.results.findIndex(r => r.id === id);
  if (idx < 0) {
    return res.status(404).json({ success: false, message: 'Result not found.' });
  }

  const [removed] = db.results.splice(idx, 1);
  return res.json({ success: true, message: 'Result deleted.', data: removed });
};

/* ── GET /api/results/stats ─────────────────
   Aggregate stats for a class/term/session.
   Query: class, arm, term, session
─────────────────────────────────────────── */
exports.getStats = (req, res) => {
  const { class: cls, arm, term, session } = req.query;

  if (req.user.role === 'Teacher' && !canEditClass(req.user, cls, arm)) {
    return res.status(403).json({ success: false, message: 'Access denied.' });
  }

  let list = [...db.results];
  if (cls)     list = list.filter(r => r.class   === cls);
  if (arm)     list = list.filter(r => r.arm     === arm);
  if (term)    list = list.filter(r => r.term    === term);
  if (session) list = list.filter(r => r.session === session);

  if (!list.length) {
    return res.json({ success: true, data: null, message: 'No results found for the given filters.' });
  }

  const totals    = list.map(r => r.total);
  const avg       = totals.reduce((a, b) => a + b, 0) / totals.length;
  const passing   = list.filter(r => r.total >= 40).length;
  const failing   = list.length - passing;

  // Grade distribution
  const gradeDist = { A: 0, B: 0, C: 0, D: 0, E: 0, F: 0 };
  list.forEach(r => { gradeDist[gradeOf(r.total).letter]++; });

  // Per-subject averages
  const bySubject = {};
  list.forEach(r => {
    if (!bySubject[r.subject]) bySubject[r.subject] = [];
    bySubject[r.subject].push(r.total);
  });
  const subjectAverages = Object.entries(bySubject).map(([subject, scores]) => ({
    subject,
    average:  parseFloat((scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1)),
    count:    scores.length,
    highest:  Math.max(...scores),
    lowest:   Math.min(...scores),
  })).sort((a, b) => b.average - a.average);

  return res.json({
    success: true,
    data: {
      filters: { class: cls, arm, term, session },
      total:   list.length,
      average: parseFloat(avg.toFixed(1)),
      highest: Math.max(...totals),
      lowest:  Math.min(...totals),
      passing,
      failing,
      passRate: parseFloat(((passing / list.length) * 100).toFixed(1)),
      gradeDist,
      subjectAverages,
    },
  });
};