'use strict';
const db = require('../config/db');

exports.getAll = (req, res) => {
  const { class: cls, arm, gender } = req.query;
  if (req.user.role === 'Teacher') {
    const data = db.studentsInClass(req.user.assignedClass, req.user.assignedArm);
    return res.json({ success: true, data, total: data.length });
  }
  if (req.user.role === 'Parent') {
    const ward = db.findStudent(req.user.wardId);
    return res.json({ success: true, data: ward ? [ward] : [], total: ward ? 1 : 0 });
  }
  let list = [...db.students];
  if (cls)    list = list.filter(s => s.class  === cls);
  if (arm)    list = list.filter(s => s.arm    === arm);
  if (gender) list = list.filter(s => s.gender === gender);
  return res.json({ success: true, data: list, total: list.length });
};

exports.getOne = (req, res) => {
  const student = db.findStudent(req.params.id);
  if (!student) return res.status(404).json({ success: false, message: 'Student not found.' });
  if (req.user.role === 'Parent' && req.user.wardId !== student.id)
    return res.status(403).json({ success: false, message: 'Access denied.' });
  return res.json({ success: true, data: student });
};

exports.create = (req, res) => {
  const { id, name, class: cls, arm, gender, attendance } = req.body;
  const missing = ['id','name','class','arm'].filter(f => !req.body[f]);
  if (missing.length)
    return res.status(400).json({ success: false, message: `Missing required fields: ${missing.join(', ')}.` });
  if (db.findStudent(id))
    return res.status(409).json({ success: false, message: `Student "${id}" already exists.` });
  if (!db.findClass(cls))
    return res.status(400).json({ success: false, message: `Class "${cls}" does not exist.` });

  const validArms = db.findClass(cls)?.arms || [];
  if (!validArms.includes(arm))
    return res.status(400).json({ success: false, message: `Arm "${arm}" invalid for "${cls}". Valid: ${validArms.join(', ')}.` });

  const student = { id, name: String(name).trim(), class: cls, arm, gender: gender || 'Unknown', attendance: attendance != null ? Number(attendance) : 100 };
  db.students.push(student);
  return res.status(201).json({ success: true, data: student });
};

exports.update = (req, res) => {
  const idx = db.students.findIndex(s => s.id === req.params.id);
  if (idx < 0) return res.status(404).json({ success: false, message: 'Student not found.' });
  if (req.body.class && !db.findClass(req.body.class))
    return res.status(400).json({ success: false, message: `Class "${req.body.class}" does not exist.` });
  const { id: _id, ...updates } = req.body;
  db.students[idx] = { ...db.students[idx], ...updates, id: req.params.id };
  return res.json({ success: true, data: db.students[idx] });
};

exports.remove = (req, res) => {
  const idx = db.students.findIndex(s => s.id === req.params.id);
  if (idx < 0) return res.status(404).json({ success: false, message: 'Student not found.' });
  const [removed] = db.students.splice(idx, 1);
  const before = db.results.length;
  db.results.splice(0, db.results.length, ...db.results.filter(r => r.studentId !== removed.id));
  return res.json({ success: true, message: `"${removed.name}" removed with ${before - db.results.length} result(s).`, data: removed });
};