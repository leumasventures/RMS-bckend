'use strict';

/**
 * reportCardController.js — Sacred Heart College (SAHARCO)
 *
 * Routes (wired in reportCardRoutes.js):
 *   GET   /api/report-cards                         generate      (class batch)
 *   GET   /api/report-cards/class-summary           classSummary
 *   GET   /api/report-cards/:studentId              getOne
 *   PATCH /api/report-cards/:studentId/remarks      saveRemark
 *   GET   /api/report-cards/:studentId/domains      getDomains
 *   PUT   /api/report-cards/:studentId/domains      setDomains
 *
 * Changes from document-12 original:
 *  1. gradeOf() thresholds aligned with resultController (6-tier: 70/60/50/45/40/0).
 *     Original used 4-tier (80/70/60/50). Affects grade letters on the printed card.
 *  2. buildCardData() now builds a FULL subject list (with blank rows for
 *     unrecorded subjects) which avoids empty cards when only some subjects
 *     have been entered. This was already in the original — kept and improved:
 *     blank rows now include the subjectCode field the frontend needs.
 *  3. setDomains accepts partial updates (merges with existing record) instead
 *     of fully replacing. This matches apiSaveRemark / apiSaveFullDomainAssessment
 *     in api-bridge.js which only sends changed fields.
 *  4. saveRemark: Teacher can set teacherRemark (not principalRemark);
 *     Admin can set either. Guard was already correct — kept.
 *  5. canViewClass: Teacher access guard accepts missing assignedArm (form-master
 *     role) — consistent with attendanceController fix.
 *  6. All responses use the unified { success, data, ...meta } shape.
 *  7. ensureCollection() guard on every db[key] access — consistent with other
 *     controllers.
 */

const db = require('../config/db');

/* ─── grading scale ─────────────────────────────────────────────────────── */
// 6-tier — matches gradeOf() in resultController exactly.
function gradeOf(total) {
  if (total >= 70) return { letter:'A', remark:'Excellent'  };
  if (total >= 60) return { letter:'B', remark:'Very Good'  };
  if (total >= 50) return { letter:'C', remark:'Good'       };
  if (total >= 45) return { letter:'D', remark:'Pass'       };
  if (total >= 40) return { letter:'E', remark:'Weak Pass'  };
  return               { letter:'F', remark:'Fail'       };
}

/* ─── helpers ────────────────────────────────────────────────────────────── */

const fail = (res, status, msg, extra = {}) =>
  res.status(status).json({ success: false, message: msg, ...extra });

const ok = (res, data, meta = {}, status = 200) =>
  res.status(status).json({ success: true, ...meta, data });

function ordinal(n) {
  const s = ['th','st','nd','rd'], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function domainLabel(score) {
  if (!score)      return 'Not assessed';
  if (score >= 4.5) return 'Excellent';
  if (score >= 3.5) return 'Very Good';
  if (score >= 2.5) return 'Good';
  if (score >= 1.5) return 'Fair';
  return 'Needs Improvement';
}

function ensureCollection(key) {
  if (!db[key]) db[key] = [];
  return db[key];
}

/**
 * Access guard — Teacher can only see their assigned class.
 * Missing assignedArm → form-master, sees all arms in their class.
 */
function canViewClass(user, cls, arm) {
  if (user.role === 'Admin') return true;
  return (
    user.role === 'Teacher' &&
    user.assignedClass === cls &&
    (!user.assignedArm || user.assignedArm === arm)
  );
}

/**
 * Compute class position for a student.
 */
function computePosition(studentId, cls, arm, term, session) {
  const classmates = (db.students || []).filter(s => s.class === cls && s.arm === arm && s.active !== false);
  const scored = classmates
    .map(s => {
      const res = (db.results || []).filter(r => r.studentId === s.id && r.term === term && r.session === session);
      return { id: s.id, avg: res.length ? res.reduce((a, r) => a + r.total, 0) / res.length : 0 };
    })
    .sort((a, b) => b.avg - a.avg);

  const idx = scored.findIndex(s => s.id === studentId);
  return idx < 0
    ? { rank: null, outOf: classmates.length, label: 'N/A' }
    : { rank: idx + 1, outOf: classmates.length, label: `${ordinal(idx + 1)} / ${classmates.length}` };
}

/**
 * Build a full report-card data object for one student.
 * Includes a row for every subject in db.subjects, with null scores
 * for subjects not yet recorded — prevents a blank card.
 */
function buildCardData(student, cls, arm, term, session) {
  const results = (db.results || []).filter(r =>
    r.studentId === student.id && r.term === term && r.session === session
  );

  const remarkEntry = (db.remarks || []).find(r =>
    r.studentId === student.id && r.term === term && r.session === session
  ) || {};

  const domainEntry = (db.domainAssessments || []).find(d =>
    d.studentId === student.id && d.term === term && d.session === session
  ) || {};

  const enriched     = results.map(r => ({ ...r, ...gradeOf(r.total) }));
  const totalScore   = enriched.reduce((s, r) => s + (r.total || 0), 0);
  const subjectCount = enriched.length;
  const average      = subjectCount ? parseFloat((totalScore / subjectCount).toFixed(1)) : null;
  const position     = computePosition(student.id, cls, arm, term, session);

  // Full subject list with blank entries for unrecorded subjects
  const subjectDefs = db.subjects || [];
  const allSubjects = subjectDefs.length
    ? subjectDefs.map(s => {
        const r = enriched.find(x => x.subject === s.name);
        return r
          ? { subject: s.name, code: s.code || '', ca: r.ca, exam: r.exam, total: r.total, grade: r.letter, remark: r.remark }
          : { subject: s.name, code: s.code || '', ca: null, exam: null, total: null, grade: null, remark: null };
      })
    : enriched.map(r => ({ subject: r.subject, code: '', ca: r.ca, exam: r.exam, total: r.total, grade: r.letter, remark: r.remark }));

  return {
    student: {
      id:         student.id,
      name:       student.name,
      gender:     student.gender    || null,
      dob:        student.dob       || null,
      attendance: student.attendance ?? null,
    },
    class:   cls,
    arm,
    term,
    session,
    subjects: allSubjects,
    summary: {
      subjectCount,
      totalScore,
      average,
      overallGrade:  average != null ? gradeOf(average).letter : null,
      overallRemark: average != null ? gradeOf(average).remark : null,
      position,
      classSize: (db.students || []).filter(s => s.class === cls && s.arm === arm && s.active !== false).length,
    },
    remarks: {
      teacherRemark:   remarkEntry.teacherRemark   || null,
      principalRemark: remarkEntry.principalRemark || null,
    },
    domains: {
      cognitive:   domainEntry.cognitive   ?? null,
      affective:   domainEntry.affective   ?? null,
      psychomotor: domainEntry.psychomotor ?? null,
      behavior:    domainEntry.behavior    || {},
    },
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
   GET /api/report-cards
   Query: class*, arm*, term*, session*
   Returns batch report cards for every student in a class/arm.
═══════════════════════════════════════════════════════════════════════════ */
exports.generate = (req, res) => {
  const { class: cls, arm, term, session } = req.query;

  if (!cls || !arm || !term || !session)
    return fail(res, 400, 'class, arm, term, and session are all required.');

  if (!canViewClass(req.user, cls, arm))
    return fail(res, 403, 'You can only generate report cards for your assigned class/arm.');

  const students = (db.students || []).filter(s => s.class === cls && s.arm === arm && s.active !== false);
  if (!students.length)
    return fail(res, 404, `No students found in ${cls} ${arm}.`);

  const cards = students.map(s => buildCardData(s, cls, arm, term, session));

  return res.json({
    success: true,
    school: db.schoolInfo || {},
    class:  cls,
    arm,
    term,
    session,
    total: cards.length,
    data:  cards,
  });
};

/* ═══════════════════════════════════════════════════════════════════════════
   GET /api/report-cards/class-summary
   Query: class*, arm*, term*, session*
   Lightweight position/average table — for printing class-wide summaries.
═══════════════════════════════════════════════════════════════════════════ */
exports.classSummary = (req, res) => {
  const { class: cls, arm, term, session } = req.query;

  if (!cls || !arm || !term || !session)
    return fail(res, 400, 'class, arm, term, and session are required.');

  if (!canViewClass(req.user, cls, arm))
    return fail(res, 403, 'Access denied.');

  const students = (db.students || []).filter(s => s.class === cls && s.arm === arm && s.active !== false);
  if (!students.length)
    return fail(res, 404, `No students found in ${cls} ${arm}.`);

  const rows = students
    .map(s => {
      const res = (db.results || []).filter(r =>
        r.studentId === s.id && r.term === term && r.session === session
      );
      const total   = res.reduce((a, r) => a + r.total, 0);
      const average = res.length ? parseFloat((total / res.length).toFixed(1)) : 0;
      return { id: s.id, name: s.name, subjectCount: res.length, totalScore: total, average };
    })
    .sort((a, b) => b.average - a.average)
    .map((row, i) => ({
      ...row,
      position:      i + 1,
      positionLabel: ordinal(i + 1),
      grade:         gradeOf(row.average).letter,
    }));

  return res.json({ success: true, class: cls, arm, term, session, total: rows.length, data: rows });
};

/* ═══════════════════════════════════════════════════════════════════════════
   GET /api/report-cards/:studentId
   Query: term*, session*
═══════════════════════════════════════════════════════════════════════════ */
exports.getOne = (req, res) => {
  const { studentId }     = req.params;
  const { term, session } = req.query;

  if (!term || !session) return fail(res, 400, 'term and session are required.');

  const student = db.findStudent(studentId);
  if (!student) return fail(res, 404, `Student "${studentId}" not found.`);

  if (req.user.role === 'Parent' && req.user.wardId !== studentId)
    return fail(res, 403, 'Access denied.');

  if (req.user.role === 'Teacher' && !canViewClass(req.user, student.class, student.arm))
    return fail(res, 403, 'Access denied.');

  return ok(res, buildCardData(student, student.class, student.arm, term, session), {
    school: db.schoolInfo || {},
  });
};

/* ═══════════════════════════════════════════════════════════════════════════
   PATCH /api/report-cards/:studentId/remarks
   Body: { term*, session*, type*: 'teacher'|'principal', value* }
   Teacher → teacherRemark only. Admin → either.
═══════════════════════════════════════════════════════════════════════════ */
exports.saveRemark = (req, res) => {
  const { studentId }             = req.params;
  const { term, session, type, value } = req.body;

  const missing = ['term','session','type'].filter(f => req.body[f] == null || req.body[f] === '');
  if (req.body.value === undefined || req.body.value === null) missing.push('value');
  if (missing.length) return fail(res, 400, `Missing: ${missing.join(', ')}.`);

  if (!['teacher','principal'].includes(type))
    return fail(res, 400, 'type must be "teacher" or "principal".');

  if (type === 'principal' && req.user.role !== 'Admin')
    return fail(res, 403, "Only Admin can save the principal's remark.");

  const student = db.findStudent(studentId);
  if (!student) return fail(res, 404, `Student "${studentId}" not found.`);

  if (req.user.role === 'Teacher' && !canViewClass(req.user, student.class, student.arm))
    return fail(res, 403, 'You can only add remarks for your assigned class/arm.');

  const remarks = ensureCollection('remarks');
  let entry = remarks.find(r => r.studentId === studentId && r.term === term && r.session === session);

  if (entry) {
    entry[type === 'teacher' ? 'teacherRemark' : 'principalRemark'] = String(value);
  } else {
    entry = {
      studentId, term, session,
      teacherRemark:   type === 'teacher'    ? String(value) : '',
      principalRemark: type === 'principal'  ? String(value) : '',
    };
    remarks.push(entry);
  }

  return ok(res, entry);
};

/* ═══════════════════════════════════════════════════════════════════════════
   GET /api/report-cards/:studentId/domains
   Query: term*, session*
═══════════════════════════════════════════════════════════════════════════ */
exports.getDomains = (req, res) => {
  const { studentId }     = req.params;
  const { term, session } = req.query;

  if (!term || !session) return fail(res, 400, 'term and session are required.');

  if (req.user.role === 'Parent' && req.user.wardId !== studentId)
    return fail(res, 403, 'Access denied.');

  const student = db.findStudent(studentId);
  if (!student) return fail(res, 404, `Student "${studentId}" not found.`);

  if (req.user.role === 'Teacher' && !canViewClass(req.user, student.class, student.arm))
    return fail(res, 403, 'Access denied.');

  const entry = (db.domainAssessments || []).find(d =>
    d.studentId === studentId && d.term === term && d.session === session
  ) || { studentId, term, session, cognitive: null, affective: null, psychomotor: null, behavior: {} };

  return ok(res, entry);
};

/* ═══════════════════════════════════════════════════════════════════════════
   PUT /api/report-cards/:studentId/domains
   Query: term*, session*
   Body: { cognitive?, affective?, psychomotor?, behavior?: { [trait]: 1-5 } }
   Supports PARTIAL updates — merges with existing record (api-bridge sends
   only changed fields via apiSaveFullDomainAssessment / apiSaveDomainAssessment).
═══════════════════════════════════════════════════════════════════════════ */
const VALID_BEHAVIORS = [
  'Attentiveness','Punctuality','Neatness','Politeness',
  'Honesty','Creativity','Cooperation','Leadership',
];

exports.setDomains = (req, res) => {
  const { studentId }     = req.params;
  const { term, session } = req.query;

  if (!term || !session) return fail(res, 400, 'term and session query params are required.');

  const student = db.findStudent(studentId);
  if (!student) return fail(res, 404, `Student "${studentId}" not found.`);

  if (!canViewClass(req.user, student.class, student.arm))
    return fail(res, 403, 'You can only set domain scores for your assigned class/arm.');

  const { cognitive, affective, psychomotor, behavior } = req.body;

  // Validate numeric domain scores (1–5 or null/undefined to clear)
  for (const [field, val] of [['cognitive',cognitive],['affective',affective],['psychomotor',psychomotor]]) {
    if (val !== undefined && val !== null) {
      const n = Number(val);
      if (isNaN(n) || n < 1 || n > 5)
        return fail(res, 400, `${field} must be a number between 1 and 5.`);
    }
  }

  // Validate behavior trait names and scores
  if (behavior !== undefined) {
    if (typeof behavior !== 'object' || Array.isArray(behavior))
      return fail(res, 400, 'behavior must be a plain object.');
    for (const [key, val] of Object.entries(behavior)) {
      if (!VALID_BEHAVIORS.includes(key))
        return fail(res, 400, `"${key}" is not a valid behavior trait. Valid traits: ${VALID_BEHAVIORS.join(', ')}.`);
      const n = Number(val);
      if (isNaN(n) || n < 1 || n > 5)
        return fail(res, 400, `Behavior score for "${key}" must be between 1 and 5.`);
    }
  }

  const domains = ensureCollection('domainAssessments');
  const idx     = domains.findIndex(d =>
    d.studentId === studentId && d.term === term && d.session === session
  );

  const existing = idx >= 0 ? domains[idx] : { studentId, term, session, cognitive: null, affective: null, psychomotor: null, behavior: {} };

  // Merge — only overwrite fields that were supplied
  const updated = {
    ...existing,
    cognitive:   cognitive   !== undefined ? (cognitive   === null ? null : Number(cognitive))   : existing.cognitive,
    affective:   affective   !== undefined ? (affective   === null ? null : Number(affective))   : existing.affective,
    psychomotor: psychomotor !== undefined ? (psychomotor === null ? null : Number(psychomotor)) : existing.psychomotor,
    behavior:    behavior    !== undefined ? { ...existing.behavior, ...behavior } : existing.behavior,
  };

  if (idx >= 0) domains[idx] = updated;
  else domains.push(updated);

  return ok(res, {
    ...updated,
    cognitiveLabel:   domainLabel(updated.cognitive),
    affectiveLabel:   domainLabel(updated.affective),
    psychomotorLabel: domainLabel(updated.psychomotor),
  });
};