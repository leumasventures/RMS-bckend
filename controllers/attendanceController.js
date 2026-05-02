'use strict';

const db = require('../config/db');

/* ══════════════════════════════════════════════════════════════════════════════
   CONSTANTS  —  mirror the frontend exactly
══════════════════════════════════════════════════════════════════════════════ */

// Frontend cycles: P → L → A → E  (single-letter, stored lowercase in records)
const STATUS_MAP = {
  p: 'Present', l: 'Late', a: 'Absent', e: 'Excused',
  present: 'Present', late: 'Late', absent: 'Absent', excused: 'Excused',
};
const VALID_STATUS_KEYS = Object.keys(STATUS_MAP); // accepts both short & long forms

// Behaviour traits used in the Domain Assessment tab
const VALID_BEHAVIORS = [
  'Attentiveness', 'Punctuality', 'Neatness', 'Politeness',
  'Honesty', 'Creativity', 'Cooperation', 'Leadership',
];

// Term date ranges — keep in sync with ATT_TERM_DATES in the frontend
const TERM_DATES = {
  'First Term':  { start: '2025-08-08', end: '2025-11-12' },
  'Second Term': { start: '2026-01-12', end: '2026-04-03' },
  'Third Term':  { start: '2026-04-04', end: '2026-08-01' },
};

/* ══════════════════════════════════════════════════════════════════════════════
   SHARED HELPERS
══════════════════════════════════════════════════════════════════════════════ */

/** Normalise any accepted status string → canonical short key (lowercase) */
function normaliseStatus(raw) {
  if (!raw) return null;
  return STATUS_MAP[String(raw).toLowerCase()] ? String(raw).toLowerCase()[0] : null;
}

/** Expand short key → display label */
function expandStatus(key) {
  return STATUS_MAP[String(key).toLowerCase()] || key;
}

function canMarkClass(user, cls, arm) {
  if (user.role === 'Admin') return true;
  return user.role === 'Teacher' &&
    user.assignedClass === cls &&
    user.assignedArm   === arm;
}

function ensureCollection(key) {
  if (!db[key]) db[key] = [];
  return db[key];
}

/**
 * Returns all weekday dates (Mon–Fri) between start and end inclusive.
 * Matches the frontend's attGetSchoolDays() logic.
 */
function getSchoolDays(term) {
  const range = TERM_DATES[term];
  if (!range) return [];
  const days = [];
  const d   = new Date(range.start + 'T00:00:00');
  const end = new Date(range.end   + 'T00:00:00');
  while (d <= end) {
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) {           // skip weekends
      days.push(d.toISOString().split('T')[0]);
    }
    d.setDate(d.getDate() + 1);
  }
  return days;
}

/** Compute attendance percentage for a student over a set of records */
function attendanceRate(records) {
  if (!records.length) return null;
  const present = records.filter(r => ['p', 'l'].includes((r.status || '').toLowerCase()[0])).length;
  return parseFloat((present / records.length * 100).toFixed(1));
}

/** Sync the student.attendance field after any upsert */
function syncStudentAttendance(studentId, term, session) {
  const student = db.findStudent(studentId);
  if (!student) return;
  const records = (db.attendance || []).filter(r =>
    r.studentId === studentId && r.term === term && r.session === session
  );
  student.attendance = records.length ? attendanceRate(records) : 100;
}

/* ══════════════════════════════════════════════════════════════════════════════
   GET /api/attendance
   Query: studentId, class, arm, date, term, session, status
   Parent → own ward only. Teacher → assigned class/arm only.
══════════════════════════════════════════════════════════════════════════════ */
exports.getAll = (req, res) => {
  const { studentId, class: cls, arm, date, term, session, status } = req.query;

  if (req.user.role === 'Parent') {
    let data = (db.attendance || []).filter(r => r.studentId === req.user.wardId);
    if (term)    data = data.filter(r => r.term    === term);
    if (session) data = data.filter(r => r.session === session);
    return res.json({ success: true, data, total: data.length });
  }

  let list = [...(db.attendance || [])];

  if (req.user.role === 'Teacher') {
    list = list.filter(r =>
      r.class === req.user.assignedClass &&
      r.arm   === req.user.assignedArm
    );
  }

  if (studentId) list = list.filter(r => r.studentId === studentId);
  if (cls)       list = list.filter(r => r.class     === cls);
  if (arm)       list = list.filter(r => r.arm       === arm);
  if (date)      list = list.filter(r => r.date      === date);
  if (term)      list = list.filter(r => r.term      === term);
  if (session)   list = list.filter(r => r.session   === session);
  if (status) {
    const norm = normaliseStatus(status);
    if (norm) list = list.filter(r => (r.status || '').toLowerCase()[0] === norm);
  }

  return res.json({ success: true, data: list, total: list.length });
};

/* ══════════════════════════════════════════════════════════════════════════════
   GET /api/attendance/school-days/:term
   Returns the list of weekday dates for a term.
   Mirrors attGetSchoolDays() so the client can validate dates server-side.
══════════════════════════════════════════════════════════════════════════════ */
exports.getSchoolDays = (req, res) => {
  const { term } = req.params;
  const days = getSchoolDays(term);
  if (!days.length)
    return res.status(404).json({ success: false, message: `Term "${term}" not found or has no school days configured.` });

  return res.json({
    success: true,
    term,
    range:  TERM_DATES[term],
    total:  days.length,
    data:   days,
  });
};

/* ══════════════════════════════════════════════════════════════════════════════
   GET /api/attendance/summary/:studentId
   Query: term, session
   Per-student attendance summary + full record list.
   Parent → own ward only.
══════════════════════════════════════════════════════════════════════════════ */
exports.getSummary = (req, res) => {
  const { studentId } = req.params;
  const { term, session } = req.query;

  if (req.user.role === 'Parent' && req.user.wardId !== studentId)
    return res.status(403).json({ success: false, message: 'Access denied.' });

  const student = db.findStudent(studentId);
  if (!student)
    return res.status(404).json({ success: false, message: `Student "${studentId}" not found.` });

  if (req.user.role === 'Teacher' && !canMarkClass(req.user, student.class, student.arm))
    return res.status(403).json({ success: false, message: 'Access denied.' });

  let records = (db.attendance || []).filter(r => r.studentId === studentId);
  if (term)    records = records.filter(r => r.term    === term);
  if (session) records = records.filter(r => r.session === session);

  const total   = records.length;
  const present = records.filter(r => (r.status || '').toLowerCase()[0] === 'p').length;
  const absent  = records.filter(r => (r.status || '').toLowerCase()[0] === 'a').length;
  const late    = records.filter(r => (r.status || '').toLowerCase()[0] === 'l').length;
  const excused = records.filter(r => (r.status || '').toLowerCase()[0] === 'e').length;
  const rate    = total ? attendanceRate(records) : null;

  return res.json({
    success: true,
    data: {
      student,
      term:    term    || 'All',
      session: session || 'All',
      summary: { total, present, absent, late, excused, attendanceRate: rate },
      records,
    },
  });
};

/* ══════════════════════════════════════════════════════════════════════════════
   GET /api/attendance/class-summary
   Query: class*, arm*, term*, session*
   Returns the Summary & Stats tab data — per-student counts + class averages.
   Mirrors attRenderSummary() in the frontend.
══════════════════════════════════════════════════════════════════════════════ */
exports.getClassSummary = (req, res) => {
  const { class: cls, arm, term, session } = req.query;

  if (!cls || !arm || !term || !session)
    return res.status(400).json({ success: false, message: 'class, arm, term, and session are required.' });

  if (!canMarkClass(req.user, cls, arm))
    return res.status(403).json({ success: false, message: 'Access denied.' });

  const students = (db.students || []).filter(s => s.class === cls && s.arm === arm);
  if (!students.length)
    return res.status(404).json({ success: false, message: `No students found in ${cls} ${arm}.` });

  const schoolDays = getSchoolDays(term);

  const rows = students.map(s => {
    const records = (db.attendance || []).filter(r =>
      r.studentId === s.id && r.class === cls && r.arm === arm &&
      r.term === term && r.session === session
    );
    const p   = records.filter(r => (r.status || '').toLowerCase()[0] === 'p').length;
    const a   = records.filter(r => (r.status || '').toLowerCase()[0] === 'a').length;
    const l   = records.filter(r => (r.status || '').toLowerCase()[0] === 'l').length;
    const e   = records.filter(r => (r.status || '').toLowerCase()[0] === 'e').length;
    const pct = p + a + l ? Math.round(p / (p + a + l) * 100) : 100;
    return {
      studentId: s.id,
      name:      s.name,
      present:   p,
      absent:    a,
      late:      l,
      excused:   e,
      attendancePct: pct,
      flag:      pct < 75 ? 'Below 75%' : null,
      status:    pct >= 90 ? 'Excellent' : pct >= 75 ? 'Satisfactory' : 'Needs Attention',
    };
  });

  const avgPct    = Math.round(rows.reduce((s, r) => s + r.attendancePct, 0) / rows.length);
  const avgP      = Math.round(rows.reduce((s, r) => s + r.present, 0) / rows.length);
  const avgA      = Math.round(rows.reduce((s, r) => s + r.absent, 0) / rows.length);
  const belowPct  = rows.filter(r => r.attendancePct < 75).length;

  return res.json({
    success: true,
    class:   cls,
    arm,
    term,
    session,
    schoolDayCount: schoolDays.length,
    classStats: { avgPct, avgPresent: avgP, avgAbsent: avgA, belowThreshold: belowPct },
    data:    rows,
  });
};

/* ══════════════════════════════════════════════════════════════════════════════
   POST /api/attendance
   Mark a single student's attendance for one day.
   Body: { studentId, class, arm, date, term, session, status, remarks? }
   status accepts: p/P/present/Present (and same for l/a/e variants)
══════════════════════════════════════════════════════════════════════════════ */
exports.mark = (req, res) => {
  const { studentId, class: cls, arm, date, term, session, remarks } = req.body;
  const statusKey = normaliseStatus(req.body.status);

  const missing = ['studentId', 'class', 'arm', 'date', 'term', 'session']
    .filter(f => !req.body[f]);
  if (!req.body.status) missing.push('status');
  if (missing.length)
    return res.status(400).json({ success: false, message: `Missing required fields: ${missing.join(', ')}.` });

  if (!statusKey)
    return res.status(400).json({ success: false, message: `Invalid status. Accepted: p, l, a, e (or Present, Late, Absent, Excused).` });

  if (!canMarkClass(req.user, cls, arm))
    return res.status(403).json({ success: false, message: 'You can only mark attendance for your assigned class.' });

  if (!db.findStudent(studentId))
    return res.status(404).json({ success: false, message: `Student "${studentId}" not found.` });

  const attendance = ensureCollection('attendance');

  // Upsert — one record per student per day per class/session
  const existing = attendance.find(r =>
    r.studentId === studentId && r.date === date &&
    r.class === cls && r.arm === arm && r.session === session
  );

  if (existing) {
    existing.status   = statusKey;
    existing.remarks  = remarks ?? existing.remarks;
    existing.markedBy = req.user.id || req.user.name;
    existing.savedAt  = new Date().toISOString();
    syncStudentAttendance(studentId, term, session);
    return res.json({ success: true, data: { ...existing, statusLabel: expandStatus(statusKey) }, updated: true });
  }

  const record = {
    id:        db.nextId ? db.nextId() : Date.now(),
    studentId,
    class:     cls,
    arm,
    date,
    term,
    session,
    status:    statusKey,
    markedBy:  req.user.id || req.user.name,
    remarks:   remarks || '',
    savedAt:   new Date().toISOString(),
  };

  attendance.push(record);
  syncStudentAttendance(studentId, term, session);
  return res.status(201).json({ success: true, data: { ...record, statusLabel: expandStatus(statusKey) }, updated: false });
};

/* ══════════════════════════════════════════════════════════════════════════════
   POST /api/attendance/bulk
   Mark an entire class for one day.
   Body: { class, arm, date, term, session, records: [{ studentId, status, remarks? }] }
   Mirrors attMarkAllToday() and attSaveAll() in the frontend.
══════════════════════════════════════════════════════════════════════════════ */
exports.bulkMark = (req, res) => {
  const { class: cls, arm, date, term, session, records } = req.body;

  if (!cls || !arm || !date || !term || !session)
    return res.status(400).json({ success: false, message: 'class, arm, date, term, and session are required.' });

  if (!Array.isArray(records) || !records.length)
    return res.status(400).json({ success: false, message: 'records[] must be a non-empty array.' });

  if (!canMarkClass(req.user, cls, arm))
    return res.status(403).json({ success: false, message: 'You can only mark attendance for your assigned class.' });

  const attendance = ensureCollection('attendance');
  const saved  = [];
  const errors = [];

  records.forEach((row, i) => {
    const label     = `Row ${i + 1}`;
    const { studentId, remarks } = row;
    const statusKey = normaliseStatus(row.status);

    if (!studentId)  { errors.push({ row: label, reason: 'studentId is required.' }); return; }
    if (!statusKey)  { errors.push({ row: label, reason: `Invalid status "${row.status}". Use p/l/a/e.` }); return; }
    if (!db.findStudent(studentId)) { errors.push({ row: label, reason: `Student "${studentId}" not found.` }); return; }

    const existing = attendance.find(r =>
      r.studentId === studentId && r.date === date &&
      r.class === cls && r.arm === arm && r.session === session
    );

    if (existing) {
      existing.status   = statusKey;
      existing.remarks  = remarks ?? existing.remarks;
      existing.markedBy = req.user.id || req.user.name;
      existing.savedAt  = new Date().toISOString();
      saved.push({ ...existing, statusLabel: expandStatus(statusKey), updated: true });
    } else {
      const record = {
        id:       db.nextId ? db.nextId() : Date.now() + i,
        studentId, class: cls, arm, date, term, session,
        status:   statusKey,
        markedBy: req.user.id || req.user.name,
        remarks:  remarks || '',
        savedAt:  new Date().toISOString(),
      };
      attendance.push(record);
      saved.push({ ...record, statusLabel: expandStatus(statusKey), updated: false });
    }
  });

  // Sync attendance % on every affected student
  const uniqueIds = [...new Set(saved.map(r => r.studentId))];
  uniqueIds.forEach(id => syncStudentAttendance(id, term, session));

  const status = saved.length === 0 ? 400 : 207;
  return res.status(status).json({
    success: saved.length > 0,
    saved:   saved.length,
    errors:  errors.length,
    data:    saved,
    issues:  errors,
  });
};

/* ══════════════════════════════════════════════════════════════════════════════
   PUT /api/attendance/:id  —  Admin or assigned Teacher
   Partial update on a single attendance record.
══════════════════════════════════════════════════════════════════════════════ */
exports.update = (req, res) => {
  const attendance = ensureCollection('attendance');
  const idx = attendance.findIndex(r => r.id === Number(req.params.id));
  if (idx < 0)
    return res.status(404).json({ success: false, message: 'Attendance record not found.' });

  const record = attendance[idx];

  if (!canMarkClass(req.user, record.class, record.arm))
    return res.status(403).json({ success: false, message: 'You can only edit attendance for your assigned class.' });

  let statusKey = record.status;
  if (req.body.status !== undefined) {
    statusKey = normaliseStatus(req.body.status);
    if (!statusKey)
      return res.status(400).json({ success: false, message: `Invalid status. Use p/l/a/e or full names.` });
  }

  const { id: _id, studentId: _sid, class: _cls, arm: _arm, date: _date, ...safeUpdates } = req.body;
  attendance[idx] = { ...record, ...safeUpdates, status: statusKey, id: record.id, savedAt: new Date().toISOString() };

  syncStudentAttendance(record.studentId, record.term, record.session);
  return res.json({ success: true, data: { ...attendance[idx], statusLabel: expandStatus(statusKey) } });
};

/* ══════════════════════════════════════════════════════════════════════════════
   DELETE /api/attendance/:id  —  Admin only
══════════════════════════════════════════════════════════════════════════════ */
exports.remove = (req, res) => {
  const attendance = ensureCollection('attendance');
  const idx = attendance.findIndex(r => r.id === Number(req.params.id));
  if (idx < 0)
    return res.status(404).json({ success: false, message: 'Attendance record not found.' });

  const [removed] = attendance.splice(idx, 1);
  syncStudentAttendance(removed.studentId, removed.term, removed.session);
  return res.json({ success: true, message: 'Attendance record deleted.', data: removed });
};

/* ══════════════════════════════════════════════════════════════════════════════
   DOMAIN ASSESSMENTS
   These are edited in the Domain Assessment tab of this same frontend module,
   so they live here rather than in reportCardController.
   reportCardController.getDomains / setDomains delegate to db.domainAssessments;
   these endpoints are the primary write surface.
══════════════════════════════════════════════════════════════════════════════ */

/* ── GET /api/attendance/domains
   Query: class*, arm*, term*, session*
   Returns domain assessments for every student in a class/arm.
   Mirrors attRenderDomainSheet() which loops over all students.
─────────────────────────────────────────────────────────────────────────── */
exports.getClassDomains = (req, res) => {
  const { class: cls, arm, term, session } = req.query;

  if (!cls || !arm || !term || !session)
    return res.status(400).json({ success: false, message: 'class, arm, term, and session are required.' });

  if (!canMarkClass(req.user, cls, arm))
    return res.status(403).json({ success: false, message: 'Access denied.' });

  const students = (db.students || []).filter(s => s.class === cls && s.arm === arm);
  const domains  = ensureCollection('domainAssessments');

  const data = students.map(s => {
    const entry = domains.find(d =>
      d.studentId === s.id && d.term === term && d.session === session
    ) || { studentId: s.id, term, session };
    return { studentId: s.id, name: s.name, ...entry };
  });

  return res.json({ success: true, class: cls, arm, term, session, data });
};

/* ── PUT /api/attendance/domains/:studentId
   Query: term*, session*
   Body: {
     cognitive?:   1-5,
     affective?:   1-5,
     psychomotor?: 1-5,
     behavior_0? through behavior_7?:  1-5   (index matches ATT_BEHAVIORS array)
   }
   Mirrors attSaveDomain() — called per-cell on change, so supports partial updates.
─────────────────────────────────────────────────────────────────────────── */
exports.setStudentDomains = (req, res) => {
  const { studentId } = req.params;
  const { term, session } = req.query;

  if (!term || !session)
    return res.status(400).json({ success: false, message: 'term and session query params are required.' });

  const student = db.findStudent(studentId);
  if (!student)
    return res.status(404).json({ success: false, message: `Student "${studentId}" not found.` });

  if (!canMarkClass(req.user, student.class, student.arm))
    return res.status(403).json({ success: false, message: 'You can only set domain scores for your assigned class/arm.' });

  // Validate domain scores
  for (const field of ['cognitive', 'affective', 'psychomotor']) {
    if (req.body[field] !== undefined && req.body[field] !== null && req.body[field] !== '') {
      const n = Number(req.body[field]);
      if (isNaN(n) || n < 1 || n > 5)
        return res.status(400).json({ success: false, message: `${field} must be between 1 and 5.` });
    }
  }

  // Validate behavior_N keys  (behavior_0 … behavior_7)
  for (const key of Object.keys(req.body)) {
    if (!key.startsWith('behavior_')) continue;
    const idx = parseInt(key.split('_')[1], 10);
    if (isNaN(idx) || idx < 0 || idx >= VALID_BEHAVIORS.length)
      return res.status(400).json({ success: false, message: `Unknown behavior key "${key}". Expected behavior_0 to behavior_${VALID_BEHAVIORS.length - 1}.` });
    const n = Number(req.body[key]);
    if (req.body[key] !== '' && req.body[key] !== null && (isNaN(n) || n < 1 || n > 5))
      return res.status(400).json({ success: false, message: `${key} must be between 1 and 5.` });
  }

  const domains = ensureCollection('domainAssessments');
  const existing = domains.find(d =>
    d.studentId === studentId && d.term === term && d.session === session
  );

  const allowedFields = ['cognitive', 'affective', 'psychomotor',
    ...VALID_BEHAVIORS.map((_, i) => `behavior_${i}`)];

  const updates = {};
  for (const field of allowedFields) {
    if (req.body[field] !== undefined) {
      updates[field] = (req.body[field] === '' || req.body[field] === null)
        ? null
        : Number(req.body[field]);
    }
  }

  if (existing) {
    Object.assign(existing, updates);
    return res.json({ success: true, data: existing });
  }

  const entry = { studentId, term, session, ...updates };
  domains.push(entry);
  return res.json({ success: true, data: entry });
};