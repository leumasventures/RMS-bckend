'use strict';
/**
 * routes/accesstoken.js — Sacred Heart College
 *
 * Access tokens allow parents to unlock result/report-card views.
 * Tokens are stored in the `access_tokens` table (see schema.js).
 *
 * Public endpoints (no auth required):
 *  POST /api/access-tokens/validate  — validate a token code
 *
 * Staff endpoints (Admin / Bursar / Teacher):
 *  GET    /api/access-tokens           — list tokens
 *  POST   /api/access-tokens           — create one token
 *  POST   /api/access-tokens/bulk      — create one token per student in an array
 *  PATCH  /api/access-tokens/:code/revoke — revoke a token
 *  DELETE /api/access-tokens/:code     — delete a token
 */

const express = require('express');
const router  = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const db = require('../config/db');

const staffAccess = [authenticate, authorize('Admin', 'Bursar', 'Teacher')];
const adminOnly   = [authenticate, authorize('Admin')];

/* ═══════════════════════════════════════════════════════════════════════
   PUBLIC — validate a result-access token
   Called by the parent portal when the parent enters a code.
═══════════════════════════════════════════════════════════════════════ */

/**
 * POST /api/access-tokens/validate
 * Body: { code, studentId? }
 *
 * Returns { valid, student_id, student_name, term, session, expires_at }
 * Also increments the `used` counter.
 */
router.post('/validate', async (req, res) => {
  try {
    const { code, studentId } = req.body || {};
    if (!code) {
      return res.status(400).json({ success: false, message: 'Token code is required.' });
    }

    const [[tok]] = await db.pool.query(
      `SELECT * FROM access_tokens WHERE code = ? LIMIT 1`,
      [code.trim().toUpperCase()]
    );

    if (!tok) {
      return res.status(404).json({ success: false, message: 'Invalid access token.' });
    }
    if (tok.revoked) {
      return res.status(403).json({ success: false, message: 'This token has been revoked.' });
    }
    if (new Date(tok.expires_at) < new Date()) {
      return res.status(403).json({
        success: false,
        message: 'This token has expired. Please request a new one from the school.',
      });
    }
    if (tok.max_uses && tok.used >= tok.max_uses) {
      return res.status(403).json({
        success: false,
        message: 'This token has reached its maximum usage limit.',
      });
    }

    // If a studentId was passed, confirm the token covers that student
    // (tokens with no student_id are class-wide or term-wide tokens)
    if (studentId && tok.student_id && tok.student_id !== studentId.trim().toUpperCase()) {
      return res.status(403).json({
        success: false,
        message: 'This token is not valid for the specified student.',
      });
    }

    // Increment use counter
    await db.pool.query(
      `UPDATE access_tokens SET used = used + 1 WHERE code = ?`,
      [tok.code]
    );

    return res.json({
      success: true,
      data: {
        valid:        true,
        student_id:   tok.student_id   || null,
        student_name: tok.student_name || null,
        class_name:   tok.class_name   || null,
        arm:          tok.arm          || null,
        term:         tok.term         || null,
        session:      tok.session      || null,
        expires_at:   tok.expires_at,
      },
    });
  } catch (e) {
    console.error('[access-tokens/validate]', e.message);
    return res.status(500).json({ success: false, message: e.message });
  }
});

/* ═══════════════════════════════════════════════════════════════════════
   STAFF — list tokens
═══════════════════════════════════════════════════════════════════════ */

/**
 * GET /api/access-tokens?studentId=&term=&session=&revoked=
 */
router.get('/', ...staffAccess, async (req, res) => {
  try {
    const { studentId, term, session, revoked } = req.query;
    let sql    = 'SELECT * FROM access_tokens WHERE 1=1';
    const vals = [];
    if (studentId)           { sql += ' AND student_id = ?'; vals.push(studentId); }
    if (term)                { sql += ' AND term = ?';        vals.push(term); }
    if (session)             { sql += ' AND session = ?';     vals.push(session); }
    if (revoked !== undefined){ sql += ' AND revoked = ?';    vals.push(Number(revoked)); }
    sql += ' ORDER BY created_at DESC';
    const [rows] = await db.pool.query(sql, vals);
    return res.json({ success: true, data: rows });
  } catch (e) {
    return res.status(500).json({ success: false, message: e.message });
  }
});

/* ═══════════════════════════════════════════════════════════════════════
   STAFF — create a single token
═══════════════════════════════════════════════════════════════════════ */

/**
 * POST /api/access-tokens
 * Body: { studentId, student_name?, class_name?, arm?, term, session?,
 *         expiresIn? (days, default 30), maxUses? }
 *
 * Returns: { code, expires_at, term, session }
 */
router.post('/', ...staffAccess, async (req, res) => {
  try {
    const {
      studentId, student_name, class_name, arm,
      term, session,
      expiresIn = 30,
      maxUses   = null,
    } = req.body || {};

    if (!studentId || !term) {
      return res.status(400).json({ success: false, message: 'studentId and term are required.' });
    }

    // Auto-fill student name/class if not provided
    let sName = student_name, sClass = class_name, sArm = arm;
    if (!sName) {
      const [[stu]] = await db.pool.query(
        `SELECT s.name, c.name AS cn, s.arm
         FROM students s LEFT JOIN classes c ON c.id = s.class_id
         WHERE s.id = ? LIMIT 1`,
        [studentId]
      ).catch(() => [[null]]);
      if (stu) { sName = stu.name; sClass = sClass || stu.cn; sArm = sArm || stu.arm; }
    }

    const rand      = () => Math.random().toString(36).substring(2, 6).toUpperCase();
    const code      = `SHC-${rand()}-${rand()}`;
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + Number(expiresIn));

    await db.pool.query(
      `INSERT INTO access_tokens
         (code, student_id, student_name, class_name, arm, term, session,
          expires_at, max_uses, used, revoked, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?)`,
      [
        code,
        studentId.trim().toUpperCase(),
        sName    || null,
        sClass   || null,
        sArm     || null,
        term,
        session  || null,
        expiresAt,
        maxUses  || null,
        req.user?.name || null,
      ]
    );

    return res.status(201).json({
      success: true,
      message: 'Access token created.',
      data: { code, expires_at: expiresAt, term, session },
    });
  } catch (e) {
    console.error('[access-tokens POST]', e.message);
    return res.status(500).json({ success: false, message: e.message });
  }
});

/* ═══════════════════════════════════════════════════════════════════════
   STAFF — bulk create (one token per student)
═══════════════════════════════════════════════════════════════════════ */

/**
 * POST /api/access-tokens/bulk
 * Body: { studentIds[], term, session?, expiresIn? }
 */
router.post('/bulk', ...staffAccess, async (req, res) => {
  try {
    const { studentIds = [], term, session, expiresIn = 30 } = req.body || {};
    if (!studentIds.length || !term) {
      return res.status(400).json({ success: false, message: 'studentIds[] and term are required.' });
    }

    const placeholders = studentIds.map(() => '?').join(',');
    const [students]   = await db.pool.query(
      `SELECT s.id, s.name, c.name AS class_name, s.arm
       FROM students s LEFT JOIN classes c ON c.id = s.class_id
       WHERE s.id IN (${placeholders})`,
      studentIds
    );

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + Number(expiresIn));
    const createdBy = req.user?.name || null;
    const tokens    = [];

    for (const stu of students) {
      const rand = () => Math.random().toString(36).substring(2, 6).toUpperCase();
      const code = `SHC-${rand()}-${rand()}`;
      await db.pool.query(
        `INSERT INTO access_tokens
           (code, student_id, student_name, class_name, arm, term, session,
            expires_at, max_uses, used, revoked, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, 0, 0, ?)`,
        [
          code, stu.id, stu.name,
          stu.class_name || null, stu.arm || null,
          term, session || null, expiresAt, createdBy,
        ]
      );
      tokens.push({ studentId: stu.id, name: stu.name, code, expires_at: expiresAt });
    }

    return res.json({ success: true, data: tokens });
  } catch (e) {
    console.error('[access-tokens/bulk]', e.message);
    return res.status(500).json({ success: false, message: e.message });
  }
});

/* ═══════════════════════════════════════════════════════════════════════
   STAFF — revoke / delete
═══════════════════════════════════════════════════════════════════════ */

/** PATCH /api/access-tokens/:code/revoke */
router.patch('/:code/revoke', ...adminOnly, async (req, res) => {
  try {
    const [r] = await db.pool.query(
      `UPDATE access_tokens SET revoked = 1 WHERE code = ?`,
      [req.params.code]
    );
    if (!r.affectedRows) return res.status(404).json({ success: false, message: 'Token not found.' });
    return res.json({ success: true, message: 'Token revoked.' });
  } catch (e) {
    return res.status(500).json({ success: false, message: e.message });
  }
});

/** DELETE /api/access-tokens/:code */
router.delete('/:code', ...adminOnly, async (req, res) => {
  try {
    await db.pool.query(`DELETE FROM access_tokens WHERE code = ?`, [req.params.code]);
    return res.json({ success: true, message: 'Token deleted.' });
  } catch (e) {
    return res.status(500).json({ success: false, message: e.message });
  }
});

module.exports = router;