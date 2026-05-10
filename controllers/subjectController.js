'use strict';

/**
 * subjectController.js — Sacred Heart College (SAHARCO)
 *
 * Routes (wired in subjectRoutes.js):
 *   GET    /api/subjects        getAll
 *   GET    /api/subjects/:id    getOne
 *   POST   /api/subjects        create
 *   PUT    /api/subjects/:id    update   (was missing; needed by openSubjectModal)
 *   DELETE /api/subjects/:id    remove
 *
 * Mirrors the VALID_LEVELS / VALID_TYPES from script2.js subjectController section.
 */

const db = require('../config/db');

/* ─── constants ─────────────────────────────────────────────────────────── */
const VALID_LEVELS = ['All', 'Junior', 'Senior'];
const VALID_TYPES  = ['Core', 'Science', 'Arts', 'Commercial', 'Vocational', 'Language'];

/* ─── helpers ────────────────────────────────────────────────────────────── */

const fail = (res, status, msg, extra = {}) =>
  res.status(status).json({ success: false, message: msg, ...extra });

const ok = (res, data, meta = {}, status = 200) =>
  res.status(status).json({ success: true, ...meta, data });

/** Deterministic numeric id — max existing + 1 (mirrors frontend Date.now() intent) */
function makeSubjectId() {
  const list = db.subjects || [];
  return list.length ? Math.max(...list.map(s => Number(s.id) || 0)) + 1 : 1;
}

/* ═══════════════════════════════════════════════════════════════════════════
   GET /api/subjects
   Query: level, type, code, search
═══════════════════════════════════════════════════════════════════════════ */
exports.getAll = (req, res) => {
  const { level, type, code, search } = req.query;

  let list = [...(db.subjects || [])];

  // level filter: 'Junior' should also include subjects marked 'All'
  if (level) list = list.filter(s => s.level === level || s.level === 'All');
  if (type)  list = list.filter(s => s.type  === type);
  if (code)  list = list.filter(s => s.code  === String(code).toUpperCase());

  if (search) {
    const q = search.toLowerCase();
    list = list.filter(s =>
      (s.name || '').toLowerCase().includes(q) ||
      (s.code || '').toLowerCase().includes(q)
    );
  }

  return res.json({ success: true, data: list, total: list.length });
};

/* ═══════════════════════════════════════════════════════════════════════════
   GET /api/subjects/:id
═══════════════════════════════════════════════════════════════════════════ */
exports.getOne = (req, res) => {
  // Accept both numeric id and subject name/code
  const target = req.params.id;
  const subject = (db.subjects || []).find(s =>
    s.id === Number(target) ||
    s.name === target ||
    s.code === String(target).toUpperCase()
  );
  if (!subject) return fail(res, 404, `Subject "${target}" not found.`);
  return ok(res, subject);
};

/* ═══════════════════════════════════════════════════════════════════════════
   POST /api/subjects
   Body: { name*, code*, level?, type? }
   Mirrors openSubjectModal form in script2.js.
═══════════════════════════════════════════════════════════════════════════ */
exports.create = (req, res) => {
  const { name, code, level = 'All', type = 'Core' } = req.body ?? {};

  const missing = ['name', 'code'].filter(f => !req.body?.[f]);
  if (missing.length) return fail(res, 400, `Missing required fields: ${missing.join(', ')}.`);

  if (!VALID_LEVELS.includes(level))
    return fail(res, 400, `level must be one of: ${VALID_LEVELS.join(', ')}.`);

  if (!VALID_TYPES.includes(type))
    return fail(res, 400, `type must be one of: ${VALID_TYPES.join(', ')}.`);

  const normalCode = String(code).trim().toUpperCase();
  const normalName = String(name).trim();

  // Duplicate checks
  if ((db.subjects || []).some(s => s.code === normalCode))
    return fail(res, 409, `Subject code "${normalCode}" already exists.`);

  if ((db.subjects || []).some(s => s.name.toLowerCase() === normalName.toLowerCase()))
    return fail(res, 409, `Subject "${normalName}" already exists.`);

  if (!db.subjects) db.subjects = [];

  const subject = { id: makeSubjectId(), name: normalName, code: normalCode, level, type };
  db.subjects.push(subject);
  return ok(res, subject, {}, 201);
};

/* ═══════════════════════════════════════════════════════════════════════════
   PUT /api/subjects/:id
   Full update — was missing from the original file.
   Allows changing name, code, level, or type.
═══════════════════════════════════════════════════════════════════════════ */
exports.update = (req, res) => {
  const idx = (db.subjects || []).findIndex(s => s.id === Number(req.params.id));
  if (idx < 0) return fail(res, 404, `Subject "${req.params.id}" not found.`);

  const { name, code, level, type } = req.body ?? {};

  if (level && !VALID_LEVELS.includes(level))
    return fail(res, 400, `level must be one of: ${VALID_LEVELS.join(', ')}.`);

  if (type && !VALID_TYPES.includes(type))
    return fail(res, 400, `type must be one of: ${VALID_TYPES.join(', ')}.`);

  const normalCode = code ? String(code).trim().toUpperCase() : undefined;
  const normalName = name ? String(name).trim() : undefined;

  // Duplicate checks (exclude self)
  if (normalCode && (db.subjects || []).some(s => s.code === normalCode && s.id !== Number(req.params.id)))
    return fail(res, 409, `Subject code "${normalCode}" already exists.`);

  if (normalName && (db.subjects || []).some(s => s.name.toLowerCase() === normalName.toLowerCase() && s.id !== Number(req.params.id)))
    return fail(res, 409, `Subject "${normalName}" already exists.`);

  const patch = {};
  if (normalName) patch.name  = normalName;
  if (normalCode) patch.code  = normalCode;
  if (level)      patch.level = level;
  if (type)       patch.type  = type;

  db.subjects[idx] = { ...db.subjects[idx], ...patch };
  return ok(res, db.subjects[idx]);
};

/* ═══════════════════════════════════════════════════════════════════════════
   DELETE /api/subjects/:id
═══════════════════════════════════════════════════════════════════════════ */
exports.remove = (req, res) => {
  const idx = (db.subjects || []).findIndex(s => s.id === Number(req.params.id));
  if (idx < 0) return fail(res, 404, `Subject "${req.params.id}" not found.`);

  const [removed] = db.subjects.splice(idx, 1);
  return ok(res, removed, { message: `Subject "${removed.name}" removed.` });
};