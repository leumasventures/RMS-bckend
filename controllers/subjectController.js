'use strict';

const db = require('../config/db');

/* ── Allowed values (mirrors frontend constants) ────────────────────────────── */
const VALID_LEVELS = ['All', 'Junior', 'Senior'];
const VALID_TYPES  = ['Core', 'Science', 'Arts', 'Commercial', 'Vocational', 'Language'];

/* ── Helpers ────────────────────────────────────────────────────────────────── */
function makeSubjectId() {
  // Use incrementing numeric id (mirrors frontend's Date.now() intent but deterministic)
  const existing = db.subjects || [];
  return existing.length ? Math.max(...existing.map(s => s.id)) + 1 : 1;
}

/* ═══════════════════════════════════════════════════════════════════════════════
   GET /api/subjects
   Query: level (All | Junior | Senior), type, code
═══════════════════════════════════════════════════════════════════════════════ */
exports.getAll = (req, res) => {
  const { level, type, code } = req.query;

  let list = [...(db.subjects || [])];

  if (level) list = list.filter(s => s.level === level || s.level === 'All');
  if (type)  list = list.filter(s => s.type  === type);
  if (code)  list = list.filter(s => s.code  === code.toUpperCase());

  return res.json({ success: true, data: list, total: list.length });
};

/* ═══════════════════════════════════════════════════════════════════════════════
   GET /api/subjects/:id
═══════════════════════════════════════════════════════════════════════════════ */
exports.getOne = (req, res) => {
  const subject = (db.subjects || []).find(s => s.id === Number(req.params.id));
  if (!subject)
    return res.status(404).json({ success: false, message: `Subject with id "${req.params.id}" not found.` });

  return res.json({ success: true, data: subject });
};

/* ═══════════════════════════════════════════════════════════════════════════════
   POST /api/subjects   —  Admin only
   Body: { name*, code*, level, type }
═══════════════════════════════════════════════════════════════════════════════ */
exports.create = (req, res) => {
  const { name, code, level = 'All', type = 'Core' } = req.body;

  // Required fields
  const missing = ['name', 'code'].filter(f => !req.body[f]);
  if (missing.length)
    return res.status(400).json({ success: false, message: `Missing required fields: ${missing.join(', ')}.` });

  // Validate enums
  if (!VALID_LEVELS.includes(level))
    return res.status(400).json({ success: false, message: `Level must be one of: ${VALID_LEVELS.join(', ')}.` });

  if (!VALID_TYPES.includes(type))
    return res.status(400).json({ success: false, message: `Type must be one of: ${VALID_TYPES.join(', ')}.` });

  const normalizedCode = String(code).trim().toUpperCase();

  // Duplicate code check
  if ((db.subjects || []).some(s => s.code === normalizedCode))
    return res.status(409).json({ success: false, message: `Subject code "${normalizedCode}" already exists.` });

  // Duplicate name check (case-insensitive)
  const normalizedName = String(name).trim();
  if ((db.subjects || []).some(s => s.name.toLowerCase() === normalizedName.toLowerCase()))
    return res.status(409).json({ success: false, message: `Subject "${normalizedName}" already exists.` });

  if (!db.subjects) db.subjects = [];

  const subject = {
    id:    makeSubjectId(),
    name:  normalizedName,
    code:  normalizedCode,
    level,
    type,
  };

  db.subjects.push(subject);
  return res.status(201).json({ success: true, data: subject });
};

/* ═══════════════════════════════════════════════════════════════════════════════
   DELETE /api/subjects/:id   —  Admin only
═══════════════════════════════════════════════════════════════════════════════ */
exports.remove = (req, res) => {
  const idx = (db.subjects || []).findIndex(s => s.id === Number(req.params.id));
  if (idx < 0)
    return res.status(404).json({ success: false, message: `Subject with id "${req.params.id}" not found.` });

  const [removed] = db.subjects.splice(idx, 1);
  return res.json({ success: true, message: `Subject "${removed.name}" removed.`, data: removed });
};