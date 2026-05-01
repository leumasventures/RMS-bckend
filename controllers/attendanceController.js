'use strict';

const db = require('../config/db');

/* ── helpers ─────────────────────────────── */
const VALID_STATUSES = ['Present', 'Absent', 'Late', 'Excused'];

function canMarkClass(user, cls, arm) {
  if (user.role === 'Admin') return true;
  return user.role === 'Teacher' &&
    user.assignedClass === cls &&
    user.assignedArm   === arm;
}

/* ── GET /api/attendance ────────────────────
   Query: studentId, class, arm, date, term, session, status
─────────────────────────────────────────── */
exports.getAll = (req, res) => {
  const { studentId, class: cls, arm, date, term, session, status } = req.query;

  // Parent sees only their ward's attendance
  if (req.user.role === 'Parent') {
    const wardId = req.user.wardId;
    let data = db.attendance.filter(a => a.studentId === wardId);
    if (term)    data = data.filter(a => a.term    === term);
    if (session) data = data.filter(a => a.session === session);
    return res.json({ success: true, data, total: data.length });
  }

  let list = [...db.attendance];

  // Teacher restricted to their class/arm
  if (req.user.role === 'Teacher') {
    list = list.filter(a =>
      a.class === req.user.assignedClass &&
      a.arm   === req.user.assignedArm
    );
  }

  if (studentId) list = list.filter(a => a.studentId === studentId);
  if (cls)       list = list.filter(a => a.class     === cls);
  if (arm)       list = list.filter(a => a.arm       === arm);
  if (date)      list = list.filter(a => a.date      === date);
  if (term)      list = list.filter(a => a.term      === term);
  if (session)   list = list.filter(a => a.session   === session);
  if (status)    list = list.filter(a => a.status    === status);

  return res.json({ success: true, data: list, total: list.length });
};

/* ── GET /api/attendance/summary/:studentId ─
   Returns attendance summary for a student
   Query: term, session
─────────────────────────────────────────── */
exports.getSummary = (req, res) => {
  const { studentId } = req.params;
  const { term, session } = req.query;

  if (req.user.role === 'Parent' && req.user.wardId !== studentId)
    return res.status(403).json({ success: false, message: 'Access denied.' });

  const student = db.findStudent(studentId);
  if (!student)
    return res.status(404).json({ success: false, message: `Student "${studentId}" not found.` });

  let records = db.getAttendanceByStudent(studentId, term, session);

  const total   = records.length;
  const present = records.filter(a => a.status === 'Present').length;
  const absent  = records.filter(a => a.status === 'Absent').length;
  const late    = records.filter(a => a.status === 'Late').length;
  const excused = records.filter(a => a.status === 'Excused').length;
  const rate    = total ? parseFloat(((present + late) / total * 100).toFixed(1)) : null;

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

/* ── POST /api/attendance ───────────────────
   Mark a single student's attendance for a day.
   Body: { studentId, class, arm, date, term, session, status, remarks? }
─────────────────────────────────────────── */
exports.mark = (req, res) => {
  const { studentId, class: cls, arm, date, term, session, status, remarks } = req.body;

  const missing = ['studentId', 'class', 'arm', 'date', 'term', 'session', 'status']
    .filter(f => !req.body[f]);
  if (missing.length)
    return res.status(400).json({ success: false, message: `Missing required fields: ${missing.join(', ')}.` });

  if (!VALID_STATUSES.includes(status))
    return res.status(400).json({ success: false, message: `Status must be one of: ${VALID_STATUSES.join(', ')}.` });

  if (!canMarkClass(req.user, cls, arm))
    return res.status(403).json({ success: false, message: 'You can only mark attendance for your assigned class.' });

  if (!db.findStudent(studentId))
    return res.status(404).json({ success: false, message: `Student "${studentId}" not found.` });

  // Upsert — one record per student per day
  const existing = db.attendanceExists(studentId, date);
  if (existing) {
    existing.status  = status;
    existing.remarks = remarks || existing.remarks;
    existing.markedBy = req.user.id || req.user.name;
    return res.json({ success: true, data: existing, updated: true });
  }

  const record = {
    id:        db.nextId(),
    studentId,
    class:     cls,
    arm,
    date,
    term,
    session,
    status,
    markedBy:  req.user.id || req.user.name,
    remarks:   remarks || '',
  };

  db.attendance.push(record);
  return res.status(201).json({ success: true, data: record, updated: false });
};

/* ── POST /api/attendance/bulk ──────────────
   Mark an entire class for one day in a single request.
   Body: {
     class, arm, date, term, session,
     records: [{ studentId, status, remarks? }]
   }
─────────────────────────────────────────── */
exports.bulkMark = (req, res) => {
  const { class: cls, arm, date, term, session, records } = req.body;

  if (!cls || !arm || !date || !term || !session)
    return res.status(400).json({ success: false, message: 'class, arm, date, term, and session are required.' });

  if (!Array.isArray(records) || !records.length)
    return res.status(400).json({ success: false, message: 'records[] must be a non-empty array.' });

  if (!canMarkClass(req.user, cls, arm))
    return res.status(403).json({ success: false, message: 'You can only mark attendance for your assigned class.' });

  const saved  = [];
  const errors = [];

  records.forEach((row, i) => {
    const label = `Row ${i + 1}`;
    const { studentId, status, remarks } = row;

    if (!studentId || !status) { errors.push({ row: label, reason: 'studentId and status are required.' }); return; }
    if (!VALID_STATUSES.includes(status)) { errors.push({ row: label, reason: `Invalid status "${status}".` }); return; }
    if (!db.findStudent(studentId)) { errors.push({ row: label, reason: `Student "${studentId}" not found.` }); return; }

    const existing = db.attendanceExists(studentId, date);
    if (existing) {
      existing.status   = status;
      existing.remarks  = remarks || existing.remarks;
      existing.markedBy = req.user.id || req.user.name;
      saved.push({ ...existing, updated: true });
    } else {
      const record = {
        id: db.nextId(), studentId, class: cls, arm, date, term, session,
        status, markedBy: req.user.id || req.user.name, remarks: remarks || '',
      };
      db.attendance.push(record);
      saved.push({ ...record, updated: false });
    }
  });

  // Update the aggregate attendance % on each student record
  saved.forEach(r => {
    const student = db.findStudent(r.studentId);
    if (!student) return;
    const allRecords = db.getAttendanceByStudent(r.studentId, term, session);
    const total = allRecords.length;
    const presentCount = allRecords.filter(a => ['Present', 'Late'].includes(a.status)).length;
    student.attendance = total ? parseFloat((presentCount / total * 100).toFixed(1)) : 100;
  });

  return res.status(errors.length && !saved.length ? 400 : 207).json({
    success: saved.length > 0,
    saved:   saved.length,
    errors:  errors.length,
    data:    saved,
    issues:  errors,
  });
};

/* ── PUT /api/attendance/:id ────────────────
   Update a single attendance record
─────────────────────────────────────────── */
exports.update = (req, res) => {
  const idx = db.attendance.findIndex(a => a.id === Number(req.params.id));
  if (idx < 0)
    return res.status(404).json({ success: false, message: 'Attendance record not found.' });

  const record = db.attendance[idx];

  if (!canMarkClass(req.user, record.class, record.arm))
    return res.status(403).json({ success: false, message: 'You can only edit attendance for your assigned class.' });

  if (req.body.status && !VALID_STATUSES.includes(req.body.status))
    return res.status(400).json({ success: false, message: `Status must be one of: ${VALID_STATUSES.join(', ')}.` });

  db.attendance[idx] = { ...record, ...req.body, id: record.id };
  return res.json({ success: true, data: db.attendance[idx] });
};

/* ── DELETE /api/attendance/:id ─── Admin ─── */
exports.remove = (req, res) => {
  const idx = db.attendance.findIndex(a => a.id === Number(req.params.id));
  if (idx < 0)
    return res.status(404).json({ success: false, message: 'Attendance record not found.' });

  const [removed] = db.attendance.splice(idx, 1);
  return res.json({ success: true, message: 'Attendance record deleted.', data: removed });
};