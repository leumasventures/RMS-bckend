'use strict';
/**
 * accesstokenController.js — Sacred Heart College (SAHARCO)
 * ALL token data persisted to MySQL `access_tokens` table.
 */
const db     = require('../config/db');
const crypto = require('crypto');

/* ── Auto-create table if missing ──────────────────────────────────────── */
let _tableReady = false;
async function ensureTable() {
  if (_tableReady) return;
  try {
    await db.run(`CREATE TABLE IF NOT EXISTS access_tokens (
      code         VARCHAR(40)  NOT NULL PRIMARY KEY,
      student_id   VARCHAR(30)  NOT NULL,
      student_name VARCHAR(120) DEFAULT NULL,
      class_name   VARCHAR(60)  DEFAULT NULL,
      arm          VARCHAR(10)  DEFAULT NULL,
      term         VARCHAR(30)  DEFAULT NULL,
      session      VARCHAR(20)  DEFAULT NULL,
      expires_at   DATETIME     NOT NULL,
      max_uses     INT UNSIGNED DEFAULT NULL,
      used         INT UNSIGNED NOT NULL DEFAULT 0,
      revoked      TINYINT(1)   NOT NULL DEFAULT 0,
      created_by   VARCHAR(120) DEFAULT NULL,
      created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    _tableReady = true;
  } catch(e) { console.warn('[access-tokens] ensureTable:', e.message); }
}

const TOKEN_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const fail = (res, s, m) => res.status(s).json({ success: false, message: m });
const ok   = (res, data, meta = {}, s = 200) => res.status(s).json({ success: true, ...meta, data });

function generateCode() {
  const year  = new Date().getFullYear();
  const bytes = crypto.randomBytes(6);
  const raw   = Array.from(bytes).map(b => TOKEN_CHARS[b % TOKEN_CHARS.length]).join('');
  return `SHC-PRC-${year}-${raw}`;
}

function tokenStatus(t) {
  if (t.revoked || t.revoked === 1)  return 'revoked';
  if (new Date() > new Date(t.expires_at)) return 'expired';
  if (t.max_uses !== null && t.used >= t.max_uses) return 'exhausted';
  return 'active';
}

function normalise(row) {
  if (!row) return null;
  const status = tokenStatus(row);
  return {
    code:        row.code,
    token:       row.code,
    studentId:   row.student_id,
    studentName: row.student_name,
    class:       row.class_name,
    arm:         row.arm,
    term:        row.term,
    session:     row.session,
    expires:     row.expires_at,
    expiresAt:   row.expires_at,
    maxUses:     row.max_uses,
    used:        row.used,
    revoked:     !!row.revoked,
    createdBy:   row.created_by,
    createdAt:   row.created_at,
    status,
  };
}

function canActOnClass(user, cls, arm) {
  if (user.role === 'Admin') return true;
  return user.role === 'Teacher' && user.assignedClass === cls &&
    (!user.assignedArm || user.assignedArm === arm);
}

/* ── GET /api/access-tokens ───────────────────────────────────────────────── */
exports.getAll = async (req, res) => {
  await ensureTable();
  try {
    const { studentId, class: cls, arm, status } = req.query;
    let sql = 'SELECT * FROM access_tokens WHERE 1=1';
    const p = [];
    if (studentId) { sql += ' AND student_id=?';  p.push(studentId); }
    if (cls)       { sql += ' AND class_name=?';  p.push(cls); }
    if (arm)       { sql += ' AND arm=?';          p.push(arm); }
    sql += ' ORDER BY created_at DESC';
    let rows = await db.query(sql, p);
    if (req.user.role === 'Teacher') {
      rows = rows.filter(r => canActOnClass(req.user, r.class_name, r.arm));
    }
    let data = rows.map(normalise);
    if (status) data = data.filter(t => t.status === status);
    return ok(res, data, { total: data.length });
  } catch (e) { return fail(res, 500, e.message); }
};

/* ── GET /api/access-tokens/student/:studentId ────────────────────────────── */
exports.getByStudent = async (req, res) => {
  try {
    const { studentId } = req.params;
    const student = await db.query1('SELECT * FROM students WHERE id=?', [studentId]);
    if (!student) return fail(res, 404, `Student "${studentId}" not found.`);
    if (req.user.role === 'Parent' && req.user.wardId !== studentId) return fail(res, 403, 'Access denied.');
    const rows = await db.query('SELECT * FROM access_tokens WHERE student_id=? ORDER BY created_at DESC', [studentId]);
    return ok(res, rows.map(normalise), { total: rows.length });
  } catch (e) { return fail(res, 500, e.message); }
};

/* ── GET /api/access-tokens/class-list ────────────────────────────────────── */
exports.getClassList = async (req, res) => {
  await ensureTable();
  try {
    const { class: cls, arm } = req.query;
    if (!cls) return fail(res, 400, 'class is required.');

    // arm is optional — if omitted, return all arms for the class
    const armFilter = arm || null;

    let studentSql = `SELECT s.*, c.name AS class_name FROM students s
       LEFT JOIN classes c ON c.id=s.class_id
       WHERE c.name=? AND s.active=1`;
    const studentParams = [cls];
    if (armFilter) { studentSql += ' AND s.arm=?'; studentParams.push(armFilter); }
    studentSql += ' ORDER BY s.arm, s.name';

    let tokenSql = 'SELECT * FROM access_tokens WHERE class_name=?';
    const tokenParams = [cls];
    if (armFilter) { tokenSql += ' AND arm=?'; tokenParams.push(armFilter); }

    const students = await db.query(studentSql, studentParams);
    const tokens   = await db.query(tokenSql, tokenParams);

    const data = students.map(s => {
      const st     = tokens.filter(t => t.student_id === s.id).map(normalise);
      const active = st.filter(t => t.status === 'active');
      const latest = active[0] || null;
      return {
        studentId: s.id, studentName: s.name,
        class: cls, arm: s.arm,
        activeCount: active.length, totalCount: st.length,
        latestCode: latest?.code || null, expiresAt: latest?.expiresAt || null,
        status: latest ? 'active' : st.length ? 'no active code' : 'none',
      };
    });
    return ok(res, data, { class: cls, arm: armFilter, total: data.length });
  } catch (e) { return fail(res, 500, e.message); }
};

/* ── GET /api/access-tokens/export/csv ───────────────────────────────────── */
exports.exportCSV = async (req, res) => {
  try {
    const { class: cls, arm } = req.query;
    let sql = 'SELECT * FROM access_tokens WHERE 1=1';
    const p = [];
    if (cls) { sql += ' AND class_name=?'; p.push(cls); }
    if (arm) { sql += ' AND arm=?'; p.push(arm); }
    sql += ' ORDER BY class_name, arm, student_name';
    const rows = await db.query(sql, p);
    const headers = ['Code','Student Name','Student ID','Class','Arm','Term','Session','Expires','Max Uses','Used','Status'];
    const lines = [headers.join(','), ...rows.map(r => {
      const n = normalise(r);
      return [n.code, n.studentName, n.studentId, n.class, n.arm, n.term||'', n.session||'', n.expiresAt||'', n.maxUses||'', n.used, n.status].join(',');
    })];
    res.setHeader('Content-Type','text/csv');
    res.setHeader('Content-Disposition','attachment; filename="access_tokens.csv"');
    return res.send(lines.join('\n'));
  } catch (e) { return fail(res, 500, e.message); }
};

/* ── GET /api/access-tokens/:code ────────────────────────────────────────── */
exports.getOne = async (req, res) => {
  try {
    const row = await db.query1('SELECT * FROM access_tokens WHERE code=?', [req.params.code]);
    if (!row) return fail(res, 404, 'Token not found.');
    return ok(res, normalise(row));
  } catch (e) { return fail(res, 500, e.message); }
};

/* ── POST /api/access-tokens — generate single ────────────────────────────── */
exports.generate = async (req, res) => {
  await ensureTable();
  try {
    const { studentId, expiryDays = 30, term, session, maxUses } = req.body;
    if (!studentId) return fail(res, 400, 'studentId is required.');

    const student = await db.query1(
      `SELECT s.*, c.name AS class_name FROM students s LEFT JOIN classes c ON c.id=s.class_id WHERE s.id=?`,
      [studentId]
    );
    if (!student) return fail(res, 404, `Student "${studentId}" not found.`);
    if (!canActOnClass(req.user, student.class_name, student.arm))
      return fail(res, 403, 'You can only generate tokens for your assigned class/arm.');

    const days = Math.min(365, Math.max(1, parseInt(expiryDays) || 30));
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + days);

    const code = generateCode();
    await db.run(
      `INSERT INTO access_tokens (code, student_id, student_name, class_name, arm, term, session, expires_at, max_uses, used, revoked, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?)`,
      [code, student.id, student.name, student.class_name, student.arm,
       term || null, session || null, expiresAt.toISOString().slice(0,19).replace('T',' '),
       maxUses ? parseInt(maxUses) : null, req.user?.name || null]
    );

    const saved = await db.query1('SELECT * FROM access_tokens WHERE code=?', [code]);
    return ok(res, normalise(saved), {}, 201);
  } catch (e) { return fail(res, 500, e.message); }
};

/* ── POST /api/access-tokens/bulk ────────────────────────────────────────── */
exports.bulkGenerate = async (req, res) => {
  try {
    const { class: cls, arm, expiryDays = 30, term, session, maxUses } = req.body;
    if (!cls || !arm) return fail(res, 400, 'class and arm are required.');
    if (!canActOnClass(req.user, cls, arm)) return fail(res, 403, 'Access denied.');

    const students = await db.query(
      `SELECT s.*, c.name AS class_name FROM students s LEFT JOIN classes c ON c.id=s.class_id
       WHERE c.name=? AND s.arm=? AND s.active=1`,
      [cls, arm]
    );
    if (!students.length) return fail(res, 404, `No students found in ${cls} ${arm}.`);

    const days = Math.min(365, Math.max(1, parseInt(expiryDays) || 30));
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + days);
    const expiresStr = expiresAt.toISOString().slice(0,19).replace('T',' ');

    const generated = [];
    for (const student of students) {
      const code = generateCode();
      await db.run(
        `INSERT INTO access_tokens (code, student_id, student_name, class_name, arm, term, session, expires_at, max_uses, used, revoked, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?)`,
        [code, student.id, student.name, cls, arm, term||null, session||null, expiresStr,
         maxUses ? parseInt(maxUses) : null, req.user?.name || null]
      );
      generated.push({ code, studentId: student.id, studentName: student.name });
    }

    return ok(res, { generated: generated.length, tokens: generated, class: cls, arm }, {}, 201);
  } catch (e) { return fail(res, 500, e.message); }
};

/* ── POST /api/access-tokens/validate — public, no auth ──────────────────── */
exports.validate = async (req, res) => {
  try {
    const code = String(req.body?.code || '').trim().toUpperCase();
    if (!code) return fail(res, 400, 'code is required.');

    const row = await db.query1('SELECT * FROM access_tokens WHERE code=?', [code]);
    if (!row) return fail(res, 404, 'Token not found. Check the code and try again.');

    const status = tokenStatus(row);
    if (status !== 'active') return fail(res, 403, `Token is ${status}.`);

    // Increment use count
    await db.run('UPDATE access_tokens SET used=used+1 WHERE code=?', [code]);

    const student = await db.query1(
      `SELECT s.*, c.name AS class_name FROM students s LEFT JOIN classes c ON c.id=s.class_id WHERE s.id=?`,
      [row.student_id]
    );

    return ok(res, {
      valid: true,
      student: student ? { id: student.id, name: student.name, class: student.class_name, arm: student.arm } : null,
      token: normalise({ ...row, used: row.used + 1 }),
    });
  } catch (e) { return fail(res, 500, e.message); }
};

/* ── PATCH /api/access-tokens/:code/revoke ────────────────────────────────── */
exports.revoke = async (req, res) => {
  try {
    const row = await db.query1('SELECT * FROM access_tokens WHERE code=?', [req.params.code]);
    if (!row) return fail(res, 404, 'Token not found.');
    await db.run('UPDATE access_tokens SET revoked=1 WHERE code=?', [req.params.code]);
    return ok(res, { code: req.params.code, revoked: true });
  } catch (e) { return fail(res, 500, e.message); }
};
exports.revokePost = exports.revoke;

/* ── DELETE /api/access-tokens/:code ─────────────────────────────────────── */
exports.remove = async (req, res) => {
  try {
    const row = await db.query1('SELECT code FROM access_tokens WHERE code=?', [req.params.code]);
    if (!row) return fail(res, 404, 'Token not found.');
    await db.run('DELETE FROM access_tokens WHERE code=?', [req.params.code]);
    return ok(res, { code: req.params.code, deleted: true });
  } catch (e) { return fail(res, 500, e.message); }
};