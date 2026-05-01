'use strict';

const db = require('../config/db');

/* ── GET /api/teachers ──────────────────────
   Query: status, subject, isFormTeacher
─────────────────────────────────────────── */
exports.getAll = (req, res) => {
  const { status, subject, isFormTeacher } = req.query;

  let list = [...db.teachers];
  if (status)       list = list.filter(t => t.status === status);
  if (subject)      list = list.filter(t => t.subjects.includes(subject));
  if (isFormTeacher !== undefined)
    list = list.filter(t => t.isFormTeacher === (isFormTeacher === 'true'));

  return res.json({ success: true, data: list, total: list.length });
};

/* ── GET /api/teachers/:id ──────────────── */
exports.getOne = (req, res) => {
  const teacher = db.findTeacher(req.params.id);
  if (!teacher)
    return res.status(404).json({ success: false, message: `Teacher "${req.params.id}" not found.` });

  return res.json({ success: true, data: teacher });
};

/* ── GET /api/teachers/:id/students ─────────
   Students in the teacher's assigned class/arm
─────────────────────────────────────────── */
exports.getStudents = (req, res) => {
  const teacher = db.findTeacher(req.params.id);
  if (!teacher)
    return res.status(404).json({ success: false, message: `Teacher "${req.params.id}" not found.` });

  if (!teacher.assignedClass)
    return res.json({ success: true, data: [], total: 0, message: 'Teacher has no assigned class.' });

  const data = db.studentsInClass(teacher.assignedClass, teacher.assignedArm);
  return res.json({ success: true, data, total: data.length });
};

/* ── POST /api/teachers ─── Admin only ─────
   Body: { id, name, email, phone, gender, qualification,
           subjects[], assignedClass, assignedArm,
           isFormTeacher, formClass, formArm, employmentDate }
─────────────────────────────────────────── */
exports.create = (req, res) => {
  const {
    id, name, email, phone, gender, qualification,
    subjects, assignedClass, assignedArm,
    isFormTeacher, formClass, formArm, employmentDate,
  } = req.body;

  const missing = ['id', 'name', 'email'].filter(f => !req.body[f]);
  if (missing.length)
    return res.status(400).json({ success: false, message: `Missing required fields: ${missing.join(', ')}.` });

  if (db.findTeacher(id))
    return res.status(409).json({ success: false, message: `Teacher "${id}" already exists.` });

  if (db.findTeacherByEmail(email))
    return res.status(409).json({ success: false, message: `Email "${email}" already in use.` });

  if (assignedClass && !db.findClass(assignedClass))
    return res.status(400).json({ success: false, message: `Class "${assignedClass}" does not exist.` });

  const teacher = {
    id,
    name:           String(name).trim(),
    email:          String(email).toLowerCase().trim(),
    phone:          phone          || '',
    gender:         gender         || 'Unknown',
    qualification:  qualification  || '',
    subjects:       Array.isArray(subjects) ? subjects : [],
    assignedClass:  assignedClass  || null,
    assignedArm:    assignedArm    || null,
    isFormTeacher:  Boolean(isFormTeacher),
    formClass:      formClass      || null,
    formArm:        formArm        || null,
    employmentDate: employmentDate || new Date().toISOString().slice(0, 10),
    status:         'Active',
  };

  db.teachers.push(teacher);
  return res.status(201).json({ success: true, data: teacher });
};

/* ── PUT /api/teachers/:id ─── Admin only ── */
exports.update = (req, res) => {
  const idx = db.teachers.findIndex(t => t.id === req.params.id);
  if (idx < 0)
    return res.status(404).json({ success: false, message: 'Teacher not found.' });

  if (req.body.assignedClass && !db.findClass(req.body.assignedClass))
    return res.status(400).json({ success: false, message: `Class "${req.body.assignedClass}" does not exist.` });

  if (req.body.email) {
    const clash = db.findTeacherByEmail(req.body.email);
    if (clash && clash.id !== req.params.id)
      return res.status(409).json({ success: false, message: `Email "${req.body.email}" already in use.` });
  }

  const { id: _id, ...updates } = req.body;
  db.teachers[idx] = { ...db.teachers[idx], ...updates, id: req.params.id };
  return res.json({ success: true, data: db.teachers[idx] });
};

/* ── PATCH /api/teachers/:id/status ─────────
   Body: { status: 'Active' | 'Inactive' | 'OnLeave' | 'Suspended' }
─────────────────────────────────────────── */
exports.updateStatus = (req, res) => {
  const { status } = req.body;
  const validStatuses = ['Active', 'Inactive', 'OnLeave', 'Suspended'];

  if (!status || !validStatuses.includes(status))
    return res.status(400).json({ success: false, message: `Status must be one of: ${validStatuses.join(', ')}.` });

  const idx = db.teachers.findIndex(t => t.id === req.params.id);
  if (idx < 0)
    return res.status(404).json({ success: false, message: 'Teacher not found.' });

  db.teachers[idx].status = status;
  return res.json({ success: true, data: db.teachers[idx] });
};

/* ── PATCH /api/teachers/:id/assign-class ───
   Body: { assignedClass, assignedArm, isFormTeacher, formClass, formArm }
─────────────────────────────────────────── */
exports.assignClass = (req, res) => {
  const { assignedClass, assignedArm, isFormTeacher, formClass, formArm } = req.body;

  if (assignedClass && !db.findClass(assignedClass))
    return res.status(400).json({ success: false, message: `Class "${assignedClass}" does not exist.` });

  const idx = db.teachers.findIndex(t => t.id === req.params.id);
  if (idx < 0)
    return res.status(404).json({ success: false, message: 'Teacher not found.' });

  db.teachers[idx] = {
    ...db.teachers[idx],
    assignedClass:  assignedClass  ?? db.teachers[idx].assignedClass,
    assignedArm:    assignedArm    ?? db.teachers[idx].assignedArm,
    isFormTeacher:  isFormTeacher  !== undefined ? Boolean(isFormTeacher) : db.teachers[idx].isFormTeacher,
    formClass:      formClass      ?? db.teachers[idx].formClass,
    formArm:        formArm        ?? db.teachers[idx].formArm,
  };

  return res.json({ success: true, data: db.teachers[idx] });
};

/* ── DELETE /api/teachers/:id ─── Admin only */
exports.remove = (req, res) => {
  const idx = db.teachers.findIndex(t => t.id === req.params.id);
  if (idx < 0)
    return res.status(404).json({ success: false, message: 'Teacher not found.' });

  const [removed] = db.teachers.splice(idx, 1);
  return res.json({ success: true, message: `Teacher "${removed.name}" removed.`, data: removed });
};