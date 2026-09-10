'use strict';

/**
 * routes/notices.js — Sacred Heart College (SAHARCO)
 *
 * FIXES:
 *  1. Added authentication middleware (notices previously had no auth at all —
 *     anyone could read or create notices without a session)
 *  2. Authorisation: only Admin can create or delete notices
 *  3. Response shape unified to { success, data } to match all other routes
 *  4. Added PUT /:id for editing existing notices
 *  5. Fixed: was using raw `pool` (root db.js) instead of `config/db`
 */

const express        = require('express');
const db             = require('../config/db');
const { authenticate, authorize } = require('../middleware/auth');

const router    = express.Router();
const adminOnly = authorize('Admin');

router.use(authenticate);

/* GET /api/notices?audience= */
router.get('/', async (req, res) => {
  const { audience } = req.query;
  try {
    let sql  = 'SELECT * FROM notices WHERE 1=1';
    const args = [];
    if (audience) { sql += ' AND (audience=? OR audience="all")'; args.push(audience); }
    sql += ' ORDER BY pinned DESC, created_at DESC';
    const rows = await db.query(sql, args);
    res.json({ success: true, data: rows, count: rows.length });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

/* GET /api/notices/:id */
router.get('/:id', async (req, res) => {
  try {
    const row = await db.query1('SELECT * FROM notices WHERE id=?', [req.params.id]);
    if (!row) return res.status(404).json({ success: false, message: 'Notice not found.' });
    res.json({ success: true, data: row });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

/* POST /api/notices  body: { title, body, audience, pinned } */
router.post('/', adminOnly, async (req, res) => {
  const { title, body, audience = 'all', pinned = false } = req.body ?? {};
  if (!title) return res.status(400).json({ success: false, message: 'title is required.' });
  try {
    const result = await db.run(
      'INSERT INTO notices (title, body, audience, pinned) VALUES (?,?,?,?)',
      [title, body || null, audience, pinned ? 1 : 0]
    );
    const created = { id: result.insertId, title, body, audience, pinned: !!pinned };
    res.status(201).json({ success: true, data: created });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

/* PUT /api/notices/:id */
router.put('/:id', adminOnly, async (req, res) => {
  try {
    const row = await db.query1('SELECT id FROM notices WHERE id=?', [req.params.id]);
    if (!row) return res.status(404).json({ success: false, message: 'Notice not found.' });
    const { title, body, audience, pinned } = req.body ?? {};
    const updates = []; const vals = [];
    if (title    !== undefined) { updates.push('title=?');    vals.push(title); }
    if (body     !== undefined) { updates.push('body=?');     vals.push(body); }
    if (audience !== undefined) { updates.push('audience=?'); vals.push(audience); }
    if (pinned   !== undefined) { updates.push('pinned=?');   vals.push(pinned ? 1 : 0); }
    if (!updates.length) return res.status(400).json({ success: false, message: 'No fields to update.' });
    vals.push(req.params.id);
    await db.run(`UPDATE notices SET ${updates.join(',')} WHERE id=?`, vals);
    res.json({ success: true, data: { id: Number(req.params.id), ...req.body } });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

/* DELETE /api/notices/:id */
router.delete('/:id', adminOnly, async (req, res) => {
  try {
    const row = await db.query1('SELECT id FROM notices WHERE id=?', [req.params.id]);
    if (!row) return res.status(404).json({ success: false, message: 'Notice not found.' });
    await db.run('DELETE FROM notices WHERE id=?', [req.params.id]);
    res.json({ success: true, data: { id: Number(req.params.id), deleted: true } });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

module.exports = router;