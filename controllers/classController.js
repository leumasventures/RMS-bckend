'use strict';

const db = require('../config/db');

/* ── GET /api/classes ─────────────────────── */
exports.getAll = (req, res) => {
  return res.json({ success: true, data: db.classes, total: db.classes.length });
};

/* ── GET /api/classes/:name ──────────────── */
exports.getOne = (req, res) => {
  const cls = db.findClass(decodeURIComponent(req.params.name));
  if (!cls) {
    return res.status(404).json({ success: false, message: `Class "${req.params.name}" not found.` });
  }
  return res.json({ success: true, data: cls });
};

/* ── GET /api/classes/:name/students ─────────
   Query: arm
─────────────────────────────────────────── */
exports.getStudents = (req, res) => {
  const cls = decodeURIComponent(req.params.name);
  const { arm } = req.query;

  // Teacher restriction
  if (req.user.role === 'Teacher' && req.user.assignedClass !== cls) {
    return res.status(403).json({ success: false, message: 'Access restricted to your assigned class.' });
  }

  if (!db.findClass(cls)) {
    return res.status(404).json({ success: false, message: `Class "${cls}" not found.` });
  }

  const data = db.studentsInClass(cls, arm);
  return res.json({ success: true, data, total: data.length });
};