'use strict';

const db = require('../config/db');

/* ── GET /api/subjects ─────────────────────
   Query: level (All | Junior | Senior), type, code
─────────────────────────────────────────── */
exports.getAll = (req, res) => {
  const { level, type, code } = req.query;

  let list = [...db.subjects];
  if (level) list = list.filter(s => s.level === level || s.level === 'All');
  if (type)  list = list.filter(s => s.type  === type);
  if (code)  list = list.filter(s => s.code  === code.toUpperCase());

  return res.json({ success: true, data: list, total: list.length });
};

/* ── GET /api/subjects/:id ───────────────── */
exports.getOne = (req, res) => {
  const subject = db.subjects.find(s => s.id === Number(req.params.id));
  if (!subject) {
    return res.status(404).json({ success: false, message: `Subject with id ${req.params.id} not found.` });
  }
  return res.json({ success: true, data: subject });
};