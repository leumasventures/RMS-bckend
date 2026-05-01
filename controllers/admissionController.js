'use strict';

const db = require('../config/db');

/* ── helpers ─────────────────────────────── */
const VALID_STATUSES = ['Pending', 'Approved', 'Rejected', 'Enrolled'];

function generateAppNo(session) {
  const year  = (session || '2025/2026').split('/')[1] || '2026';
  const count = db.admissions.length + 1;
  return `ADM/${year}/${String(count).padStart(3, '0')}`;
}

/* ── GET /api/admissions ────────────────────
   Query: status, session, applyingForClass
─────────────────────────────────────────── */
exports.getAll = (req, res) => {
  const { status, session, applyingForClass } = req.query;

  let list = [...db.admissions];
  if (status)           list = list.filter(a => a.status           === status);
  if (session)          list = list.filter(a => a.session          === session);
  if (applyingForClass) list = list.filter(a => a.applyingForClass === applyingForClass);

  return res.json({ success: true, data: list, total: list.length });
};

/* ── GET /api/admissions/:id ────────────── */
exports.getOne = (req, res) => {
  const admission = db.findAdmission(req.params.id);
  if (!admission)
    return res.status(404).json({ success: false, message: `Admission record ${req.params.id} not found.` });

  return res.json({ success: true, data: admission });
};

/* ── POST /api/admissions ───────────────────
   Creates a new application (status: Pending)
   Body: { applicantName, dob, gender, parentName, parentPhone,
           parentEmail, address, applyingForClass,
           previousSchool, session, notes }
─────────────────────────────────────────── */
exports.create = (req, res) => {
  const {
    applicantName, dob, gender, parentName, parentPhone,
    parentEmail, address, applyingForClass, previousSchool, session, notes,
  } = req.body;

  const missing = ['applicantName', 'dob', 'gender', 'parentName', 'parentPhone', 'applyingForClass', 'session']
    .filter(f => !req.body[f]);
  if (missing.length)
    return res.status(400).json({ success: false, message: `Missing required fields: ${missing.join(', ')}.` });

  if (!db.findClass(applyingForClass))
    return res.status(400).json({ success: false, message: `Class "${applyingForClass}" does not exist.` });

  const admission = {
    id:                db.nextId(),
    applicationNo:     generateAppNo(session),
    applicantName:     String(applicantName).trim(),
    dob,
    gender,
    parentName:        String(parentName).trim(),
    parentPhone:       String(parentPhone).trim(),
    parentEmail:       parentEmail    || '',
    address:           address        || '',
    applyingForClass,
    previousSchool:    previousSchool || '',
    session,
    status:            'Pending',
    appliedAt:         new Date().toISOString().slice(0, 10),
    admittedAt:        null,
    assignedStudentId: null,
    assignedClass:     null,
    assignedArm:       null,
    notes:             notes || '',
  };

  db.admissions.push(admission);
  return res.status(201).json({ success: true, data: admission });
};

/* ── PUT /api/admissions/:id ────────────────
   General update (Admin only)
─────────────────────────────────────────── */
exports.update = (req, res) => {
  const idx = db.admissions.findIndex(a => a.id === Number(req.params.id));
  if (idx < 0)
    return res.status(404).json({ success: false, message: 'Admission record not found.' });

  if (req.body.status && !VALID_STATUSES.includes(req.body.status))
    return res.status(400).json({ success: false, message: `Status must be one of: ${VALID_STATUSES.join(', ')}.` });

  const { id: _id, applicationNo: _appNo, ...updates } = req.body;
  db.admissions[idx] = { ...db.admissions[idx], ...updates };
  return res.json({ success: true, data: db.admissions[idx] });
};

/* ── PATCH /api/admissions/:id/approve ──────
   Approves the application.
   Body: { assignedClass, assignedArm, notes? }
─────────────────────────────────────────── */
exports.approve = (req, res) => {
  const idx = db.admissions.findIndex(a => a.id === Number(req.params.id));
  if (idx < 0)
    return res.status(404).json({ success: false, message: 'Admission record not found.' });

  const admission = db.admissions[idx];

  if (admission.status === 'Enrolled')
    return res.status(400).json({ success: false, message: 'Application is already enrolled.' });
  if (admission.status === 'Rejected')
    return res.status(400).json({ success: false, message: 'A rejected application cannot be approved directly. Update status first.' });

  const { assignedClass, assignedArm, notes } = req.body;

  if (!assignedClass || !assignedArm)
    return res.status(400).json({ success: false, message: 'assignedClass and assignedArm are required to approve.' });

  if (!db.findClass(assignedClass))
    return res.status(400).json({ success: false, message: `Class "${assignedClass}" does not exist.` });

  db.admissions[idx] = {
    ...admission,
    status:       'Approved',
    assignedClass,
    assignedArm,
    admittedAt:   new Date().toISOString().slice(0, 10),
    notes:        notes !== undefined ? notes : admission.notes,
  };

  return res.json({ success: true, data: db.admissions[idx] });
};

/* ── PATCH /api/admissions/:id/reject ───────
   Body: { notes? }
─────────────────────────────────────────── */
exports.reject = (req, res) => {
  const idx = db.admissions.findIndex(a => a.id === Number(req.params.id));
  if (idx < 0)
    return res.status(404).json({ success: false, message: 'Admission record not found.' });

  if (db.admissions[idx].status === 'Enrolled')
    return res.status(400).json({ success: false, message: 'An enrolled student cannot be rejected.' });

  db.admissions[idx].status = 'Rejected';
  if (req.body.notes !== undefined) db.admissions[idx].notes = req.body.notes;

  return res.json({ success: true, data: db.admissions[idx] });
};

/* ── PATCH /api/admissions/:id/enrol ────────
   Converts an Approved application into a real student record.
   Auto-generates a student ID and pushes to db.students.
   Body: { studentId? }  — optional custom student ID
─────────────────────────────────────────── */
exports.enrol = (req, res) => {
  const idx = db.admissions.findIndex(a => a.id === Number(req.params.id));
  if (idx < 0)
    return res.status(404).json({ success: false, message: 'Admission record not found.' });

  const admission = db.admissions[idx];

  if (admission.status !== 'Approved')
    return res.status(400).json({ success: false, message: 'Only Approved applications can be enrolled.' });

  // Generate student ID: SHC/NNN
  const studentId = req.body.studentId ||
    `SHC/${String(db.students.length + 1).padStart(3, '0')}`;

  if (db.findStudent(studentId))
    return res.status(409).json({ success: false, message: `Student ID "${studentId}" already exists. Provide a different one.` });

  const student = {
    id:           studentId,
    name:         admission.applicantName,
    class:        admission.assignedClass,
    arm:          admission.assignedArm,
    gender:       admission.gender,
    dob:          admission.dob,
    parentPhone:  admission.parentPhone,
    address:      admission.address,
    attendance:   100,
  };

  db.students.push(student);
  db.admissions[idx] = {
    ...admission,
    status:            'Enrolled',
    assignedStudentId: studentId,
  };

  return res.status(201).json({
    success: true,
    message: `Student "${student.name}" enrolled as ${studentId}.`,
    student,
    admission: db.admissions[idx],
  });
};

/* ── DELETE /api/admissions/:id ─── Admin ─── */
exports.remove = (req, res) => {
  const idx = db.admissions.findIndex(a => a.id === Number(req.params.id));
  if (idx < 0)
    return res.status(404).json({ success: false, message: 'Admission record not found.' });

  if (db.admissions[idx].status === 'Enrolled')
    return res.status(400).json({ success: false, message: 'Cannot delete an enrolled admission. Remove the student record instead.' });

  const [removed] = db.admissions.splice(idx, 1);
  return res.json({ success: true, message: `Admission ${removed.applicationNo} deleted.`, data: removed });
};