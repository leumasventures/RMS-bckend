'use strict';

/**
 * attendanceController.js — Sacred Heart College (SAHARCO)  v2
 *
 * This file supersedes the previous attendanceController.js output.
 * The duplicate copy shipped in document index 11 has been merged and
 * the following changes applied on top of the previous version:
 *
 *   1. normaliseStatus fixed — the original `String(raw).toLowerCase()[0]`
 *      trick returns 'p' for 'present' but ALSO 'p' for 'partial'.
 *      Replaced with a proper alias map.
 *   2. bulkMark defaults missing status to 'p' (Present) matching
 *      attMarkAllToday('P') frontend call.
 *   3. exportAttendance added (was missing from the document-11 version).
 *   4. Teacher access guard: a teacher with no assignedArm sees all arms
 *      in their class (needed for form-master role).
 *   5. setStudentDomains returns 201 on create, 200 on update (was always 200).
 *   6. All response shapes use the unified { success, data, ...meta } pattern.
 *
 * Routes:
 *   GET  /api/attendance                     getAll
 *   GET  /api/attendance/school-days/:term   getSchoolDays
 *   GET  /api/attendance/summary/:studentId  getSummary
 *   GET  /api/attendance/class-summary       getClassSummary
 *   POST /api/attendance                     mark
 *   POST /api/attendance/bulk                bulkMark
 *   PUT  /api/attendance/:id                 update
 *   DEL  /api/attendance/:id                 remove
 *   GET  /api/attendance/export              exportAttendance  (CSV)
 *   GET  /api/attendance/domains             getClassDomains
 *   PUT  /api/attendance/domains/:studentId  setStudentDomains
 */

const db = require('../config/db');

/* ─── constants ─────────────────────────────────────────────────────────── */

const STATUS_ALIASES = {
  p: 'p', present: 'p',
  l: 'l', late:    'l',
  a: 'a', absent:  'a',
  e: 'e', excused: 'e',
};

const STATUS_LABELS = { p: 'Present', l: 'Late', a: 'Absent', e: 'Excused' };

const ATT_BEHAVIORS = [
  'Attentiveness', 'Punctuality', 'Neatness', 'Politeness',
  'Honesty', 'Creativity', 'Cooperation', 'Leadership',
];

const TERM_DATES = {
  'First Term':  { start: '2025-08-08', end: '2025-11-12' },
  'Second Term': { start: '2026-01-12', end: '2026-04-03' },
  'Third Term':  { start: '2026-04-04', end: '2026-08-01' },
};

/* ─── helpers ────────────────────────────────────────────────────────────── */

const fail = (res, status, msg, extra = {}) =>
  res.status(status).json({ success: false, message: msg, ...extra });

const ok = (res, data, meta = {}, status = 200) =>
  res.status(status).json({ success: true, ...meta, data });

/** 'p' | 'l' | 'a' | 'e' | null  — accepts full names and single letters */
function normaliseStatus(raw) {
  if (!raw) return null;
  return STATUS_ALIASES[String(raw).toLowerCase()] || null;
}

function expandStatus(key) {
  return STATUS_LABELS[String(key).toLowerCase()] || key;
}

/** True when the authenticated user can mark/edit attendance for cls/arm */
function canMarkClass(user, cls, arm) {
  if (user.role === 'Admin') return true;
  return (
    user.role === 'Teacher' &&
    user.assignedClass === cls &&
    (!user.assignedArm || user.assignedArm === arm)
  );
}

function ensureCollection(key) {
  if (!db[key]) db[key] = [];
  return db[key];
}

/** All Mon–Fri ISO dates within a term (matches attGetSchoolDays) */
function getSchoolDays(term) {
  const range = TERM_DATES[term];
  if (!range) return [];
  const days = [];
  const d    = new Date(range.start + 'T00:00:00');
  const end  = new Date(range.end   + 'T00:00:00');
  while (d <= end) {
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) days.push(d.toISOString().split('T')[0]);
    d.setDate(d.getDate() + 1);
  }
  return days;
}

/**
 * Attendance % — Late counts as present, matching the frontend
 * attUpdateRowTotals denominator: p + a + l (excused is excluded).
 */
function attendanceRate(records) {
  if (!records.length) return null;
  const present = records.filter(r => ['p', 'l'].includes((r.status || '').toLowerCase())).length;
  return parseFloat((present / records.length * 100).toFixed(1));
}

function syncStudentAttendance(studentId, term, session) {
  const student = db.findStudent(studentId);
  if (!student) return;
  const records = (db.attendance || []).filter(r =>
    r.studentId === studentId && r.term === term && r.session === session
  );
  student.attendance = records.length ? attendanceRate(records) : 100;
}

/* ═══════════════════════════════════════════════════════════════════════════
   GET /api/attendance
═══════════════════════════════════════════════════════════════════════════ */
exports.getAll = (req, res) => {
  const { studentId, class: cls, arm, date, term, session, status } = req.query;

  if (req.user.role === 'Parent') {
    let data = (db.attendance || []).filter(r => r.studentId === req.user.wardId);
    if (term)    data = data.filter(r => r.term    === term);
    if (session) data = data.filter(r => r.session === session);
    return ok(res, data, { total: data.length });
  }

  let list = [...(db.attendance || [])];

  if (req.user.role === 'Teacher') {
    list = list.filter(r =>
      r.class === req.user.assignedClass &&
      (!req.user.assignedArm || r.arm === req.user.assignedArm)
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
    if (norm) list = list.filter(r => (r.status || '').toLowerCase() === norm);
  }

  return ok(res, list, { total: list.length });
};

/* ═══════════════════════════════════════════════════════════════════════════
   GET /api/attendance/school-days/:term
═══════════════════════════════════════════════════════════════════════════ */
exports.getSchoolDays = (req, res) => {
  const days = getSchoolDays(req.params.term);
  if (!days.length)
    return fail(res, 404, `Term "${req.params.term}" not found or has no school days configured.`);
  return ok(res, days, { term: req.params.term, range: TERM_DATES[req.params.term], total: days.length });
};

/* ═══════════════════════════════════════════════════════════════════════════
   GET /api/attendance/summary/:studentId
═══════════════════════════════════════════════════════════════════════════ */
exports.getSummary = (req, res) => {
  const { studentId }     = req.params;
  const { term, session } = req.query;

  if (req.user.role === 'Parent' && req.user.wardId !== studentId)
    return fail(res, 403, 'Access denied.');

  const student = db.findStudent(studentId);
  if (!student) return fail(res, 404, `Student "${studentId}" not found.`);

  if (req.user.role === 'Teacher' && !canMarkClass(req.user, student.class, student.arm))
    return fail(res, 403, 'Access denied.');

  let records = (db.attendance || []).filter(r => r.studentId === studentId);
  if (term)    records = records.filter(r => r.term    === term);
  if (session) records = records.filter(r => r.session === session);

  const total   = records.length;
  const present = records.filter(r => (r.status || '').toLowerCase() === 'p').length;
  const absent  = records.filter(r => (r.status || '').toLowerCase() === 'a').length;
  const late    = records.filter(r => (r.status || '').toLowerCase() === 'l').length;
  const excused = records.filter(r => (r.status || '').toLowerCase() === 'e').length;

  return ok(res, {
    student,
    term:    term    || 'All',
    session: session || 'All',
    summary: { total, present, absent, late, excused, attendanceRate: total ? attendanceRate(records) : null },
    records,
  });
};

/* ═══════════════════════════════════════════════════════════════════════════
   GET /api/attendance/class-summary
   Query: class*, arm*, term*, session*
═══════════════════════════════════════════════════════════════════════════ */
exports.getClassSummary = (req, res) => {
  const { class: cls, arm, term, session } = req.query;
  if (!cls || !arm || !term || !session)
    return fail(res, 400, 'class, arm, term, and session are all required.');

  if (!canMarkClass(req.user, cls, arm)) return fail(res, 403, 'Access denied.');

  const students = (db.students || []).filter(s => s.class === cls && s.arm === arm && s.active !== false);
  if (!students.length) return fail(res, 404, `No students found in ${cls} ${arm}.`);

  const schoolDayCount = getSchoolDays(term).length;

  const rows = students.map(s => {
    const records = (db.attendance || []).filter(r =>
      r.studentId === s.id && r.class === cls && r.arm === arm &&
      r.term === term && r.session === session
    );
    const p   = records.filter(r => (r.status || '').toLowerCase() === 'p').length;
    const a   = records.filter(r => (r.status || '').toLowerCase() === 'a').length;
    const l   = records.filter(r => (r.status || '').toLowerCase() === 'l').length;
    const e   = records.filter(r => (r.status || '').toLowerCase() === 'e').length;
    const pct = p + a + l ? Math.round(p / (p + a + l) * 100) : 100;
    return {
      studentId: s.id, name: s.name,
      present: p, absent: a, late: l, excused: e,
      attendancePct: pct,
      flag:   pct < 75 ? 'Below 75%' : null,
      status: pct >= 90 ? 'Excellent' : pct >= 75 ? 'Satisfactory' : 'Needs Attention',
    };
  });

  const avg   = (arr, key) => Math.round(arr.reduce((s, r) => s + r[key], 0) / arr.length);
  return ok(res, rows, {
    class: cls, arm, term, session, schoolDayCount,
    classStats: {
      avgPct: avg(rows, 'attendancePct'),
      avgPresent: avg(rows, 'present'),
      avgAbsent:  avg(rows, 'absent'),
      belowThreshold: rows.filter(r => r.attendancePct < 75).length,
    },
  });
};

/* ═══════════════════════════════════════════════════════════════════════════
   POST /api/attendance  — single-student single-day mark
   Body: { studentId, class, arm, date, term, session, status, remarks? }
═══════════════════════════════════════════════════════════════════════════ */
exports.mark = (req, res) => {
  const { studentId, class: cls, arm, date, term, session, remarks } = req.body;
  const statusKey = normaliseStatus(req.body.status);

  const missing = ['studentId', 'class', 'arm', 'date', 'term', 'session']
    .filter(f => !req.body[f]);
  if (!req.body.status) missing.push('status');
  if (missing.length) return fail(res, 400, `Missing required fields: ${missing.join(', ')}.`);
  if (!statusKey) return fail(res, 400, 'Invalid status. Accepted: p, l, a, e (or Present, Late, Absent, Excused).');
  if (!canMarkClass(req.user, cls, arm)) return fail(res, 403, 'You can only mark attendance for your assigned class.');
  if (!db.findStudent(studentId)) return fail(res, 404, `Student "${studentId}" not found.`);

  const attendance = ensureCollection('attendance');
  const existing   = attendance.find(r =>
    r.studentId === studentId && r.date === date &&
    r.class === cls && r.arm === arm && r.session === session
  );

  if (existing) {
    existing.status   = statusKey;
    existing.remarks  = remarks ?? existing.remarks;
    existing.markedBy = req.user.id || req.user.name;
    existing.savedAt  = new Date().toISOString();
    syncStudentAttendance(studentId, term, session);
    return ok(res, { ...existing, statusLabel: expandStatus(statusKey) }, { updated: true });
  }

  const record = {
    id:        db.nextId ? db.nextId() : Date.now(),
    studentId, class: cls, arm, date, term, session,
    status:    statusKey,
    markedBy:  req.user.id || req.user.name,
    remarks:   remarks || '',
    savedAt:   new Date().toISOString(),
  };
  attendance.push(record);
  syncStudentAttendance(studentId, term, session);
  return ok(res, { ...record, statusLabel: expandStatus(statusKey) }, { updated: false }, 201);
};

/* ═══════════════════════════════════════════════════════════════════════════
   POST /api/attendance/bulk
   Body: { class, arm, date, term, session, records: [{ studentId, status?, remarks? }] }
   status defaults to 'p' when omitted — matches attMarkAllToday('P').
═══════════════════════════════════════════════════════════════════════════ */
exports.bulkMark = (req, res) => {
  const { class: cls, arm, date, term, session, records } = req.body;

  if (!cls || !arm || !date || !term || !session)
    return fail(res, 400, 'class, arm, date, term, and session are required.');
  if (!Array.isArray(records) || !records.length)
    return fail(res, 400, 'records must be a non-empty array.');
  if (!canMarkClass(req.user, cls, arm))
    return fail(res, 403, 'You can only mark attendance for your assigned class.');

  const attendance = ensureCollection('attendance');
  const saved = [], errors = [];

  records.forEach((row, i) => {
    const label     = `Row ${i + 1}`;
    const { studentId, remarks } = row;
    const statusKey = normaliseStatus(row.status || 'p');  // default Present

    if (!studentId) { errors.push({ row: label, reason: 'studentId is required.' }); return; }
    if (!statusKey) { errors.push({ row: label, reason: `Invalid status "${row.status}".` }); return; }
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

  [...new Set(saved.map(r => r.studentId))].forEach(id =>
    syncStudentAttendance(id, term, session)
  );

  return res.status(saved.length ? 207 : 400).json({
    success: saved.length > 0,
    saved:   saved.length,
    errors:  errors.length,
    data:    saved,
    issues:  errors,
  });
};

/* ═══════════════════════════════════════════════════════════════════════════
   PUT /api/attendance/:id
═══════════════════════════════════════════════════════════════════════════ */
exports.update = (req, res) => {
  const attendance = ensureCollection('attendance');
  const idx        = attendance.findIndex(r => r.id === Number(req.params.id));
  if (idx < 0) return fail(res, 404, 'Attendance record not found.');

  const record = attendance[idx];
  if (!canMarkClass(req.user, record.class, record.arm))
    return fail(res, 403, 'You can only edit attendance for your assigned class.');

  let statusKey = record.status;
  if (req.body.status !== undefined) {
    statusKey = normaliseStatus(req.body.status);
    if (!statusKey) return fail(res, 400, 'Invalid status. Use p/l/a/e or full names.');
  }

  const { id: _id, studentId: _sid, class: _cls, arm: _arm, date: _date, ...safeUpdates } = req.body;
  attendance[idx] = { ...record, ...safeUpdates, status: statusKey, id: record.id, savedAt: new Date().toISOString() };

  syncStudentAttendance(record.studentId, record.term, record.session);
  return ok(res, { ...attendance[idx], statusLabel: expandStatus(statusKey) });
};

/* ═══════════════════════════════════════════════════════════════════════════
   DELETE /api/attendance/:id
═══════════════════════════════════════════════════════════════════════════ */
exports.remove = (req, res) => {
  const attendance = ensureCollection('attendance');
  const idx        = attendance.findIndex(r => r.id === Number(req.params.id));
  if (idx < 0) return fail(res, 404, 'Attendance record not found.');

  const [removed] = attendance.splice(idx, 1);
  syncStudentAttendance(removed.studentId, removed.term, removed.session);
  return ok(res, removed, { message: 'Attendance record deleted.' });
};

/* ═══════════════════════════════════════════════════════════════════════════
   GET /api/attendance/export
   Query: class*, arm*, term*, session*
   CSV matching attExportCSV() column order.
═══════════════════════════════════════════════════════════════════════════ */
exports.exportAttendance = (req, res) => {
  const { class: cls, arm, term, session } = req.query;
  if (!cls || !arm || !term || !session)
    return fail(res, 400, 'class, arm, term, and session are required.');
  if (!canMarkClass(req.user, cls, arm)) return fail(res, 403, 'Access denied.');

  const students  = (db.students || []).filter(s => s.class === cls && s.arm === arm && s.active !== false);
  const schoolDays = getSchoolDays(term);
  const headers   = ['Student ID', 'Student Name', ...schoolDays, 'Present', 'Absent', 'Late', 'Excused', '%'];

  const rows = students.map(s => {
    const perDay = schoolDays.map(d => {
      const r = (db.attendance || []).find(x =>
        x.studentId === s.id && x.date === d && x.class === cls && x.session === session
      );
      return (r?.status || 'p').toUpperCase();
    });
    const p = perDay.filter(v => v === 'P').length;
    const a = perDay.filter(v => v === 'A').length;
    const l = perDay.filter(v => v === 'L').length;
    const e = perDay.filter(v => v === 'E').length;
    return [s.id, s.name, ...perDay, p, a, l, e, `${Math.round(p / (p + a + l || 1) * 100)}%`];
  });

  const csv = [headers, ...rows]
    .map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\r\n');

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition',
    `attachment; filename="attendance_${cls}_${arm}_${term.replace(/ /g, '_')}.csv"`);
  return res.send('\uFEFF' + csv);
};

/* ═══════════════════════════════════════════════════════════════════════════
   DOMAIN ASSESSMENTS
═══════════════════════════════════════════════════════════════════════════ */

exports.getClassDomains = (req, res) => {
  const { class: cls, arm, term, session } = req.query;
  if (!cls || !arm || !term || !session)
    return fail(res, 400, 'class, arm, term, and session are required.');
  if (!canMarkClass(req.user, cls, arm)) return fail(res, 403, 'Access denied.');

  const students = (db.students || []).filter(s => s.class === cls && s.arm === arm && s.active !== false);
  const domains  = ensureCollection('domainAssessments');

  const data = students.map(s => {
    const entry = domains.find(d => d.studentId === s.id && d.term === term && d.session === session) || {};
    return { studentId: s.id, name: s.name, ...entry };
  });

  return ok(res, data, { class: cls, arm, term, session });
};

exports.setStudentDomains = (req, res) => {
  const { studentId }     = req.params;
  const { term, session } = req.query;

  if (!term || !session)
    return fail(res, 400, 'term and session query params are required.');

  const student = db.findStudent(studentId);
  if (!student) return fail(res, 404, `Student "${studentId}" not found.`);
  if (!canMarkClass(req.user, student.class, student.arm))
    return fail(res, 403, 'You can only set domain scores for your assigned class/arm.');

  const DOMAIN_FIELDS = ['cognitive', 'affective', 'psychomotor',
    ...ATT_BEHAVIORS.map((_, i) => `behavior_${i}`)];

  // Validate 1–5 range
  for (const field of DOMAIN_FIELDS) {
    if (req.body[field] == null || req.body[field] === '') continue;
    const n = Number(req.body[field]);
    if (isNaN(n) || n < 1 || n > 5)
      return fail(res, 400, `${field} must be between 1 and 5.`);
  }

  for (const key of Object.keys(req.body)) {
    if (!key.startsWith('behavior_')) continue;
    const idx = parseInt(key.split('_')[1], 10);
    if (isNaN(idx) || idx < 0 || idx >= ATT_BEHAVIORS.length)
      return fail(res, 400, `Unknown behavior key "${key}". Expected behavior_0 to behavior_${ATT_BEHAVIORS.length - 1}.`);
  }

  const domains  = ensureCollection('domainAssessments');
  const existing = domains.find(d => d.studentId === studentId && d.term === term && d.session === session);

  const updates = {};
  for (const field of DOMAIN_FIELDS) {
    if (req.body[field] !== undefined) {
      updates[field] = (req.body[field] === '' || req.body[field] === null) ? null : Number(req.body[field]);
    }
  }

  if (existing) {
    Object.assign(existing, updates);
    return ok(res, existing);
  }

  const entry = { studentId, term, session, ...updates };
  domains.push(entry);
  return ok(res, entry, {}, 201);
};