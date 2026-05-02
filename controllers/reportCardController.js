'use strict';

const db = require('../config/db');

/* ══════════════════════════════════════════════════════════════════════════════
   SHARED HELPERS
══════════════════════════════════════════════════════════════════════════════ */
function gradeOf(total) {
  if (total >= 80) return { letter: 'A', remark: 'Excellent'  };
  if (total >= 70) return { letter: 'B', remark: 'Very Good'  };
  if (total >= 60) return { letter: 'C', remark: 'Good'       };
  if (total >= 50) return { letter: 'D', remark: 'Pass'       };
  return               { letter: 'F', remark: 'Fail'       };
}

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function domainLabel(score) {
  if (!score) return 'Not assessed';
  if (score >= 4.5) return 'Excellent';
  if (score >= 3.5) return 'Very Good';
  if (score >= 2.5) return 'Good';
  if (score >= 1.5) return 'Fair';
  return 'Needs Improvement';
}

/* Compute class position for a student */
function computePosition(studentId, cls, arm, term, session) {
  const students = (db.students || []).filter(s => s.class === cls && s.arm === arm);
  const scores = students
    .map(s => {
      const res = (db.results || []).filter(r =>
        r.studentId === s.id && r.term === term && r.session === session
      );
      return { id: s.id, avg: res.length ? res.reduce((a, b) => a + b.total, 0) / res.length : 0 };
    })
    .sort((a, b) => b.avg - a.avg);

  const idx = scores.findIndex(s => s.id === studentId);
  return idx < 0
    ? { rank: null, outOf: students.length, label: 'N/A' }
    : { rank: idx + 1, outOf: students.length, label: `${ordinal(idx + 1)} / ${students.length}` };
}

/* Build a single student's report-card payload */
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

  const enriched = results.map(r => ({ ...r, ...gradeOf(r.total) }));
  const totalScore   = enriched.reduce((sum, r) => sum + (r.total || 0), 0);
  const subjectCount = enriched.length;
  const average      = subjectCount ? parseFloat((totalScore / subjectCount).toFixed(1)) : null;
  const position     = computePosition(student.id, cls, arm, term, session);

  /* Build full subject list with blanks for unrecorded subjects */
  const allSubjects = (db.subjects || []).map(s => {
    const r = enriched.find(x => x.subject === s.name);
    return r
      ? { subject: s.name, ca: r.ca, exam: r.exam, total: r.total, grade: r.letter, remark: r.remark }
      : { subject: s.name, ca: null, exam: null, total: null, grade: null, remark: null };
  });

  return {
    student: {
      id:         student.id,
      name:       student.name,
      gender:     student.gender    || null,
      dob:        student.dob       || null,
      attendance: student.attendance ?? null,
    },
    class:    cls,
    arm,
    term,
    session,
    subjects:  allSubjects,
    summary: {
      subjectCount,
      totalScore,
      average,
      overallGrade:  average != null ? gradeOf(average).letter : null,
      overallRemark: average != null ? gradeOf(average).remark : null,
      position,
      classSize: (db.students || []).filter(s => s.class === cls && s.arm === arm).length,
    },
    remarks: {
      teacherRemark:   remarkEntry.teacherRemark   || null,
      principalRemark: remarkEntry.principalRemark || null,
    },
    domains: {
      cognitive:   domainEntry.cognitive   || null,
      affective:   domainEntry.affective   || null,
      psychomotor: domainEntry.psychomotor || null,
      behavior:    domainEntry.behavior    || {},
    },
  };
}

/* Permission helpers */
function canViewClass(user, cls, arm) {
  if (user.role === 'Admin') return true;
  return user.role === 'Teacher' &&
    user.assignedClass === cls &&
    user.assignedArm   === arm;
}

function ensureCollection(key) {
  if (!db[key]) db[key] = [];
  return db[key];
}

/* ══════════════════════════════════════════════════════════════════════════════
   GET /api/report-cards
   Query: class*, arm*, term*, session*
   Returns an array of report cards for every student in the class/arm.
   Admin → any class. Teacher → assigned class/arm only.
══════════════════════════════════════════════════════════════════════════════ */
exports.generate = (req, res) => {
  const { class: cls, arm, term, session } = req.query;

  if (!cls || !arm || !term || !session)
    return res.status(400).json({ success: false, message: 'class, arm, term, and session are all required.' });

  if (!canViewClass(req.user, cls, arm))
    return res.status(403).json({ success: false, message: 'You can only generate report cards for your assigned class/arm.' });

  const students = (db.students || []).filter(s => s.class === cls && s.arm === arm);
  if (!students.length)
    return res.status(404).json({ success: false, message: `No students found in ${cls} ${arm}.` });

  const cards = students.map(s => buildCardData(s, cls, arm, term, session));

  return res.json({
    success:    true,
    school:     db.schoolInfo || {},
    class:      cls,
    arm,
    term,
    session,
    total:      cards.length,
    data:       cards,
  });
};

/* ══════════════════════════════════════════════════════════════════════════════
   GET /api/report-cards/:studentId
   Query: term*, session*
   Returns a single student's complete report card.
   Admin & Teacher (assigned class) → full card.
   Parent → own ward only.
══════════════════════════════════════════════════════════════════════════════ */
exports.getOne = (req, res) => {
  const { studentId } = req.params;
  const { term, session } = req.query;

  if (!term || !session)
    return res.status(400).json({ success: false, message: 'term and session are required.' });

  const student = db.findStudent(studentId);
  if (!student)
    return res.status(404).json({ success: false, message: `Student "${studentId}" not found.` });

  // Parent: own ward only
  if (req.user.role === 'Parent' && req.user.wardId !== studentId)
    return res.status(403).json({ success: false, message: 'Access denied.' });

  // Teacher: assigned class/arm only
  if (req.user.role === 'Teacher' && !canViewClass(req.user, student.class, student.arm))
    return res.status(403).json({ success: false, message: 'Access denied.' });

  const card = buildCardData(student, student.class, student.arm, term, session);
  return res.json({ success: true, school: db.schoolInfo || {}, data: card });
};

/* ══════════════════════════════════════════════════════════════════════════════
   PATCH /api/report-cards/:studentId/remarks  —  Admin or assigned Teacher
   Body: { term*, session*, type*: 'teacher'|'principal', value* }
   Saves or updates a teacher/principal remark on a student's report card.
   Only Admin may set principalRemark.
══════════════════════════════════════════════════════════════════════════════ */
exports.saveRemark = (req, res) => {
  const { studentId } = req.params;
  const { term, session, type, value } = req.body;

  const missing = ['term', 'session', 'type', 'value'].filter(f =>
    req.body[f] === undefined || req.body[f] === null
  );
  if (missing.length)
    return res.status(400).json({ success: false, message: `Missing: ${missing.join(', ')}.` });

  if (!['teacher', 'principal'].includes(type))
    return res.status(400).json({ success: false, message: 'type must be "teacher" or "principal".' });

  // Only Admin may set principal remark
  if (type === 'principal' && req.user.role !== 'Admin')
    return res.status(403).json({ success: false, message: 'Only Admin can save the principal\'s remark.' });

  const student = db.findStudent(studentId);
  if (!student)
    return res.status(404).json({ success: false, message: `Student "${studentId}" not found.` });

  // Teacher permission check
  if (req.user.role === 'Teacher' && !canViewClass(req.user, student.class, student.arm))
    return res.status(403).json({ success: false, message: 'You can only add remarks for your assigned class/arm.' });

  const remarks = ensureCollection('remarks');
  let entry = remarks.find(r =>
    r.studentId === studentId && r.term === term && r.session === session
  );

  if (entry) {
    entry[type === 'teacher' ? 'teacherRemark' : 'principalRemark'] = String(value);
  } else {
    entry = {
      studentId,
      term,
      session,
      teacherRemark:   type === 'teacher'   ? String(value) : '',
      principalRemark: type === 'principal' ? String(value) : '',
    };
    remarks.push(entry);
  }

  return res.json({ success: true, data: entry });
};

/* ══════════════════════════════════════════════════════════════════════════════
   GET /api/report-cards/:studentId/domains
   Query: term*, session*
   Returns the domain assessments (cognitive/affective/psychomotor/behavior).
══════════════════════════════════════════════════════════════════════════════ */
exports.getDomains = (req, res) => {
  const { studentId } = req.params;
  const { term, session } = req.query;

  if (!term || !session)
    return res.status(400).json({ success: false, message: 'term and session are required.' });

  if (req.user.role === 'Parent' && req.user.wardId !== studentId)
    return res.status(403).json({ success: false, message: 'Access denied.' });

  const student = db.findStudent(studentId);
  if (!student)
    return res.status(404).json({ success: false, message: `Student "${studentId}" not found.` });

  if (req.user.role === 'Teacher' && !canViewClass(req.user, student.class, student.arm))
    return res.status(403).json({ success: false, message: 'Access denied.' });

  const entry = (db.domainAssessments || []).find(d =>
    d.studentId === studentId && d.term === term && d.session === session
  ) || { studentId, term, session, cognitive: null, affective: null, psychomotor: null, behavior: {} };

  return res.json({ success: true, data: entry });
};

/* ══════════════════════════════════════════════════════════════════════════════
   PUT /api/report-cards/:studentId/domains  —  Admin or assigned Teacher
   Query: term*, session*
   Body: {
     cognitive?:   number (1–5),
     affective?:   number (1–5),
     psychomotor?: number (1–5),
     behavior?: {
       Attentiveness?, Punctuality?, Neatness?, Politeness?,
       Honesty?, Creativity?, Cooperation?, Leadership?
     }
   }
   Creates or fully replaces the domain assessment record.
══════════════════════════════════════════════════════════════════════════════ */
const VALID_BEHAVIORS = [
  'Attentiveness', 'Punctuality', 'Neatness', 'Politeness',
  'Honesty', 'Creativity', 'Cooperation', 'Leadership',
];

exports.setDomains = (req, res) => {
  const { studentId } = req.params;
  const { term, session } = req.query;

  if (!term || !session)
    return res.status(400).json({ success: false, message: 'term and session query params are required.' });

  const student = db.findStudent(studentId);
  if (!student)
    return res.status(404).json({ success: false, message: `Student "${studentId}" not found.` });

  if (!canViewClass(req.user, student.class, student.arm))
    return res.status(403).json({ success: false, message: 'You can only set domain scores for your assigned class/arm.' });

  const { cognitive, affective, psychomotor, behavior } = req.body;

  // Validate domain scores (1–5 or null)
  for (const [field, val] of [['cognitive', cognitive], ['affective', affective], ['psychomotor', psychomotor]]) {
    if (val !== undefined && val !== null) {
      const n = Number(val);
      if (isNaN(n) || n < 1 || n > 5)
        return res.status(400).json({ success: false, message: `${field} must be a number between 1 and 5.` });
    }
  }

  // Validate behavior keys and scores
  if (behavior !== undefined) {
    if (typeof behavior !== 'object' || Array.isArray(behavior))
      return res.status(400).json({ success: false, message: 'behavior must be an object.' });

    for (const [key, val] of Object.entries(behavior)) {
      if (!VALID_BEHAVIORS.includes(key))
        return res.status(400).json({ success: false, message: `"${key}" is not a valid behavior trait.` });
      const n = Number(val);
      if (isNaN(n) || n < 1 || n > 5)
        return res.status(400).json({ success: false, message: `Behavior score for "${key}" must be between 1 and 5.` });
    }
  }

  const domains = ensureCollection('domainAssessments');
  const idx = domains.findIndex(d =>
    d.studentId === studentId && d.term === term && d.session === session
  );

  const updated = {
    studentId,
    term,
    session,
    cognitive:   cognitive   !== undefined ? Number(cognitive)   : (idx >= 0 ? domains[idx].cognitive   : null),
    affective:   affective   !== undefined ? Number(affective)   : (idx >= 0 ? domains[idx].affective   : null),
    psychomotor: psychomotor !== undefined ? Number(psychomotor) : (idx >= 0 ? domains[idx].psychomotor : null),
    behavior:    behavior    !== undefined ? behavior            : (idx >= 0 ? domains[idx].behavior    : {}),
  };

  if (idx >= 0) domains[idx] = updated;
  else domains.push(updated);

  return res.json({
    success: true,
    data: {
      ...updated,
      cognitiveLabel:   domainLabel(updated.cognitive),
      affectiveLabel:   domainLabel(updated.affective),
      psychomotorLabel: domainLabel(updated.psychomotor),
    },
  });
};

/* ══════════════════════════════════════════════════════════════════════════════
   GET /api/report-cards/class-summary
   Query: class*, arm*, term*, session*
   Returns a lightweight position/average table for a class — useful for
   printing class-wide summaries without the full card payload.
══════════════════════════════════════════════════════════════════════════════ */
exports.classSummary = (req, res) => {
  const { class: cls, arm, term, session } = req.query;

  if (!cls || !arm || !term || !session)
    return res.status(400).json({ success: false, message: 'class, arm, term, and session are required.' });

  if (!canViewClass(req.user, cls, arm))
    return res.status(403).json({ success: false, message: 'Access denied.' });

  const students = (db.students || []).filter(s => s.class === cls && s.arm === arm);
  if (!students.length)
    return res.status(404).json({ success: false, message: `No students found in ${cls} ${arm}.` });

  const rows = students
    .map(s => {
      const res = (db.results || []).filter(r =>
        r.studentId === s.id && r.term === term && r.session === session
      );
      const total   = res.reduce((a, b) => a + b.total, 0);
      const average = res.length ? parseFloat((total / res.length).toFixed(1)) : 0;
      return { id: s.id, name: s.name, subjectCount: res.length, totalScore: total, average };
    })
    .sort((a, b) => b.average - a.average)
    .map((row, i) => ({
      ...row,
      position:     i + 1,
      positionLabel: ordinal(i + 1),
      grade:         gradeOf(row.average).letter,
    }));

  return res.json({
    success: true,
    class:   cls,
    arm,
    term,
    session,
    total:   rows.length,
    data:    rows,
  });
};