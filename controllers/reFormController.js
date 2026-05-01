'use strict';

const db = require('../config/db');

/* ── helpers ─────────────────────────────── */
const VALID_TYPES    = ['ReRegistration', 'Promotion', 'Demotion', 'TransferOut', 'TransferIn'];
const VALID_STATUSES = ['Pending', 'Approved', 'Rejected'];

function generateRefNo(type, session) {
  const year  = (session || '2025/2026').split('/')[1] || '2026';
  const count = db.reForms.length + 1;
  const prefix = {
    ReRegistration: 'REG',
    Promotion:      'PRO',
    Demotion:       'DEM',
    TransferOut:    'TRO',
    TransferIn:     'TRI',
  }[type] || 'REF';
  return `${prefix}/${year}/${String(count).padStart(3, '0')}`;
}

/* ── GET /api/reforms ───────────────────────
   Query: type, status, studentId, session, term
─────────────────────────────────────────── */
exports.getAll = (req, res) => {
  const { type, status, studentId, session, term } = req.query;

  let list = [...db.reForms];
  if (type)      list = list.filter(r => r.type      === type);
  if (status)    list = list.filter(r => r.status    === status);
  if (studentId) list = list.filter(r => r.studentId === studentId);
  if (session)   list = list.filter(r => r.toSession === session || r.fromSession === session);
  if (term)      list = list.filter(r => r.term      === term);

  return res.json({ success: true, data: list, total: list.length });
};

/* ── GET /api/reforms/:id ───────────────── */
exports.getOne = (req, res) => {
  const form = db.findReForm(req.params.id);
  if (!form)
    return res.status(404).json({ success: false, message: `Re-form ${req.params.id} not found.` });

  // Enrich with student info
  const student = db.findStudent(form.studentId);
  return res.json({ success: true, data: { ...form, student: student || null } });
};

/* ── GET /api/reforms/student/:studentId ────
   All form history for one student
─────────────────────────────────────────── */
exports.getByStudent = (req, res) => {
  const student = db.findStudent(req.params.studentId);
  if (!student)
    return res.status(404).json({ success: false, message: `Student "${req.params.studentId}" not found.` });

  const data = db.getReFormsByStudent(req.params.studentId);
  return res.json({ success: true, data, total: data.length, student });
};

/* ── POST /api/reforms ──────────────────────
   Create a new re-registration / transfer form.
   Body: {
     studentId, type,
     fromClass, fromArm, toClass, toArm,
     fromSession, toSession, term, notes?
   }
─────────────────────────────────────────── */
exports.create = (req, res) => {
  const {
    studentId, type,
    fromClass, fromArm, toClass, toArm,
    fromSession, toSession, term, notes,
  } = req.body;

  const missing = ['studentId', 'type', 'fromClass', 'fromArm', 'toClass', 'toArm', 'fromSession', 'toSession', 'term']
    .filter(f => !req.body[f]);
  if (missing.length)
    return res.status(400).json({ success: false, message: `Missing required fields: ${missing.join(', ')}.` });

  if (!VALID_TYPES.includes(type))
    return res.status(400).json({ success: false, message: `Type must be one of: ${VALID_TYPES.join(', ')}.` });

  if (!db.findStudent(studentId))
    return res.status(404).json({ success: false, message: `Student "${studentId}" not found.` });

  if (!db.findClass(fromClass))
    return res.status(400).json({ success: false, message: `fromClass "${fromClass}" does not exist.` });

  if (!db.findClass(toClass))
    return res.status(400).json({ success: false, message: `toClass "${toClass}" does not exist.` });

  const form = {
    id:          db.nextId(),
    refNo:       generateRefNo(type, toSession),
    studentId,
    type,
    fromClass,
    fromArm,
    toClass,
    toArm,
    fromSession,
    toSession,
    term,
    status:      'Pending',
    initiatedBy: req.user.id,
    approvedBy:  null,
    initiatedAt: new Date().toISOString().slice(0, 10),
    approvedAt:  null,
    notes:       notes || '',
  };

  db.reForms.push(form);
  return res.status(201).json({ success: true, data: form });
};

/* ── PATCH /api/reforms/:id/approve ─────────
   Approves the form and (for most types) updates the student's class/arm.
─────────────────────────────────────────── */
exports.approve = (req, res) => {
  const idx = db.reForms.findIndex(r => r.id === Number(req.params.id));
  if (idx < 0)
    return res.status(404).json({ success: false, message: 'Re-form not found.' });

  const form = db.reForms[idx];

  if (form.status !== 'Pending')
    return res.status(400).json({ success: false, message: `Form is already "${form.status}". Only Pending forms can be approved.` });

  // Update form
  db.reForms[idx] = {
    ...form,
    status:     'Approved',
    approvedBy: req.user.id,
    approvedAt: new Date().toISOString().slice(0, 10),
    notes:      req.body.notes !== undefined ? req.body.notes : form.notes,
  };

  // Apply class/arm change to the student record
  // (Not for TransferOut — student leaves the school)
  if (form.type !== 'TransferOut') {
    const student = db.findStudent(form.studentId);
    if (student) {
      student.class = form.toClass;
      student.arm   = form.toArm;
    }
  }

  const student = db.findStudent(form.studentId);
  return res.json({
    success: true,
    message: `Form ${form.refNo} approved.${form.type !== 'TransferOut' ? ` Student moved to ${form.toClass} ${form.toArm}.` : ' Student marked for transfer out.'}`,
    data:    db.reForms[idx],
    student: student || null,
  });
};

/* ── PATCH /api/reforms/:id/reject ──────────
   Body: { notes? }
─────────────────────────────────────────── */
exports.reject = (req, res) => {
  const idx = db.reForms.findIndex(r => r.id === Number(req.params.id));
  if (idx < 0)
    return res.status(404).json({ success: false, message: 'Re-form not found.' });

  if (db.reForms[idx].status !== 'Pending')
    return res.status(400).json({ success: false, message: `Only Pending forms can be rejected.` });

  db.reForms[idx].status = 'Rejected';
  if (req.body.notes !== undefined) db.reForms[idx].notes = req.body.notes;

  return res.json({ success: true, data: db.reForms[idx] });
};

/* ── PUT /api/reforms/:id ───────────────────
   Update a Pending form (Admin only)
─────────────────────────────────────────── */
exports.update = (req, res) => {
  const idx = db.reForms.findIndex(r => r.id === Number(req.params.id));
  if (idx < 0)
    return res.status(404).json({ success: false, message: 'Re-form not found.' });

  if (db.reForms[idx].status !== 'Pending')
    return res.status(400).json({ success: false, message: 'Only Pending forms can be edited.' });

  if (req.body.type && !VALID_TYPES.includes(req.body.type))
    return res.status(400).json({ success: false, message: `Type must be one of: ${VALID_TYPES.join(', ')}.` });

  if (req.body.toClass && !db.findClass(req.body.toClass))
    return res.status(400).json({ success: false, message: `toClass "${req.body.toClass}" does not exist.` });

  const { id: _id, refNo: _ref, status: _status, ...updates } = req.body;
  db.reForms[idx] = { ...db.reForms[idx], ...updates };
  return res.json({ success: true, data: db.reForms[idx] });
};

/* ── DELETE /api/reforms/:id ─── Admin only── */
exports.remove = (req, res) => {
  const idx = db.reForms.findIndex(r => r.id === Number(req.params.id));
  if (idx < 0)
    return res.status(404).json({ success: false, message: 'Re-form not found.' });

  if (db.reForms[idx].status === 'Approved')
    return res.status(400).json({ success: false, message: 'Approved forms cannot be deleted. Reject first if needed.' });

  const [removed] = db.reForms.splice(idx, 1);
  return res.json({ success: true, message: `Form ${removed.refNo} deleted.`, data: removed });
};