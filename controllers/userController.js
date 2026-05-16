'use strict';

/**
 * userController.js — Sacred Heart College (SAHARCO)
 * Admin-only endpoints for managing portal user accounts.
 *
 * Routes (mount at /api/users):
 *   GET    /api/users              getAll
 *   GET    /api/users/:id          getOne
 *   POST   /api/users              create
 *   PUT    /api/users/:id          update
 *   PATCH  /api/users/:id/status   setStatus
 *   PATCH  /api/users/:id/password resetPassword
 *   DELETE /api/users/:id          remove
 */

const bcrypt = require('bcryptjs');
const db     = require('../config/db');

const VALID_ROLES = ['Admin', 'Teacher', 'Student', 'Parent', 'Staff'];
const SALT_ROUNDS = 10;

const fail = (res, s, m) => res.status(s).json({ success: false, message: m });
const ok   = (res, data, meta = {}, s = 200) => res.status(s).json({ success: true, ...meta, data });

function safeUser(u) {
  const { password_hash, ...safe } = u;
  return safe;
}

/* ── GET /api/users ──────────────────────────────────────────────── */
exports.getAll = async (req, res) => {
  try {
    const { role, active, search } = req.query;
    let sql = `SELECT id, staff_id, student_id, name, email, role,
               assigned_class, assigned_arm, ward_id, active, created_at
               FROM users WHERE 1=1`;
    const p = [];
    if (role)   { sql += ' AND role=?';         p.push(role); }
    if (active != null) { sql += ' AND active=?'; p.push(active === 'true' || active === '1' ? 1 : 0); }
    if (search) { sql += ' AND (name LIKE ? OR email LIKE ?)'; p.push(`%${search}%`, `%${search}%`); }
    sql += ' ORDER BY name';
    const rows = await db.query(sql, p);
    return ok(res, rows.map(safeUser), { count: rows.length });
  } catch (e) { return fail(res, 500, e.message); }
};

/* ── GET /api/users/:id ──────────────────────────────────────────── */
exports.getOne = async (req, res) => {
  try {
    const row = await db.query1(
      `SELECT id, staff_id, student_id, name, email, role,
       assigned_class, assigned_arm, ward_id, active, created_at
       FROM users WHERE id=?`, [req.params.id]);
    if (!row) return fail(res, 404, 'User not found.');
    return ok(res, safeUser(row));
  } catch (e) { return fail(res, 500, e.message); }
};

/* ── POST /api/users ─────────────────────────────────────────────── */
exports.create = async (req, res) => {
  try {
    const { name, email, role, password, staff_id, student_id,
            assigned_class, assigned_arm, ward_id } = req.body ?? {};

    if (!name)     return fail(res, 400, 'name is required.');
    if (!email)    return fail(res, 400, 'email is required.');
    if (!role)     return fail(res, 400, 'role is required.');
    if (!password) return fail(res, 400, 'password is required.');
    if (!VALID_ROLES.includes(role)) return fail(res, 400, `role must be one of: ${VALID_ROLES.join(', ')}.`);
    if (password.length < 6) return fail(res, 400, 'password must be at least 6 characters.');

    const existing = await db.query1('SELECT id FROM users WHERE email=?', [email.toLowerCase().trim()]);
    if (existing) return fail(res, 409, 'Email already in use.');

    const hash = await bcrypt.hash(password, SALT_ROUNDS);
    const result = await db.run(
      `INSERT INTO users (name, email, role, password_hash, staff_id, student_id,
       assigned_class, assigned_arm, ward_id, active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      [String(name).trim(), email.toLowerCase().trim(), role, hash,
       staff_id || null, student_id || null,
       assigned_class || null, assigned_arm || null, ward_id || null]
    );

    const saved = await db.query1(
      `SELECT id, staff_id, student_id, name, email, role,
       assigned_class, assigned_arm, ward_id, active, created_at
       FROM users WHERE id=?`, [result.insertId]);

    // Sync in-memory cache
    if (db.users) db.users.push({ ...safeUser(saved), active: true });

    return ok(res, safeUser(saved), {}, 201);
  } catch (e) { return fail(res, 500, e.message); }
};

/* ── PUT /api/users/:id ──────────────────────────────────────────── */
exports.update = async (req, res) => {
  try {
    const row = await db.query1('SELECT * FROM users WHERE id=?', [req.params.id]);
    if (!row) return fail(res, 404, 'User not found.');

    // Prevent last admin from losing Admin role
    if (row.role === 'Admin' && req.body.role && req.body.role !== 'Admin') {
      const adminCount = await db.query1("SELECT COUNT(*) AS cnt FROM users WHERE role='Admin' AND active=1");
      if (Number(adminCount?.cnt) <= 1)
        return fail(res, 400, 'Cannot change role: this is the only active Admin account.');
    }

    const fields = ['name','email','role','staff_id','student_id','assigned_class','assigned_arm','ward_id'];
    const sets = [], vals = [];
    fields.forEach(f => {
      if (req.body[f] !== undefined) {
        if (f === 'role' && !VALID_ROLES.includes(req.body[f]))
          return; // skip invalid role silently — checked below
        sets.push(`${f}=?`);
        vals.push(f === 'email' ? req.body[f].toLowerCase().trim() : req.body[f]);
      }
    });
    if (req.body.role && !VALID_ROLES.includes(req.body.role))
      return fail(res, 400, `role must be one of: ${VALID_ROLES.join(', ')}.`);

    if (!sets.length) return fail(res, 400, 'No valid fields to update.');
    vals.push(req.params.id);
    await db.run(`UPDATE users SET ${sets.join(',')} WHERE id=?`, vals);

    const updated = await db.query1(
      `SELECT id, staff_id, student_id, name, email, role,
       assigned_class, assigned_arm, ward_id, active, created_at
       FROM users WHERE id=?`, [req.params.id]);

    // Sync cache
    const cached = db.users?.find(u => u.id === Number(req.params.id));
    if (cached) Object.assign(cached, safeUser(updated));

    return ok(res, safeUser(updated));
  } catch (e) { return fail(res, 500, e.message); }
};

/* ── PATCH /api/users/:id/status ─────────────────────────────────── */
exports.setStatus = async (req, res) => {
  try {
    const { active } = req.body ?? {};
    if (active === undefined) return fail(res, 400, 'active (true/false) is required.');

    const row = await db.query1('SELECT * FROM users WHERE id=?', [req.params.id]);
    if (!row) return fail(res, 404, 'User not found.');

    // Prevent deactivating the last admin
    if (row.role === 'Admin' && !active) {
      const adminCount = await db.query1("SELECT COUNT(*) AS cnt FROM users WHERE role='Admin' AND active=1");
      if (Number(adminCount?.cnt) <= 1)
        return fail(res, 400, 'Cannot deactivate: this is the only active Admin account.');
    }

    const val = active === true || active === 1 || active === 'true' ? 1 : 0;
    await db.run('UPDATE users SET active=? WHERE id=?', [val, req.params.id]);

    const cached = db.users?.find(u => u.id === Number(req.params.id));
    if (cached) cached.active = !!val;

    return ok(res, { id: Number(req.params.id), active: !!val });
  } catch (e) { return fail(res, 500, e.message); }
};

/* ── PATCH /api/users/:id/password ───────────────────────────────── */
exports.resetPassword = async (req, res) => {
  try {
    const { password } = req.body ?? {};
    if (!password) return fail(res, 400, 'password is required.');
    if (password.length < 6) return fail(res, 400, 'password must be at least 6 characters.');

    const row = await db.query1('SELECT id FROM users WHERE id=?', [req.params.id]);
    if (!row) return fail(res, 404, 'User not found.');

    const hash = await bcrypt.hash(password, SALT_ROUNDS);
    await db.run('UPDATE users SET password_hash=? WHERE id=?', [hash, req.params.id]);

    return ok(res, { id: Number(req.params.id), message: 'Password reset successfully.' });
  } catch (e) { return fail(res, 500, e.message); }
};

/* ── DELETE /api/users/:id ───────────────────────────────────────── */
exports.remove = async (req, res) => {
  try {
    // Cannot delete yourself
    if (Number(req.params.id) === req.user.id)
      return fail(res, 400, 'You cannot delete your own account.');

    const row = await db.query1('SELECT * FROM users WHERE id=?', [req.params.id]);
    if (!row) return fail(res, 404, 'User not found.');

    if (row.role === 'Admin') {
      const adminCount = await db.query1("SELECT COUNT(*) AS cnt FROM users WHERE role='Admin' AND active=1");
      if (Number(adminCount?.cnt) <= 1)
        return fail(res, 400, 'Cannot delete: this is the only active Admin account.');
    }

    await db.run('DELETE FROM users WHERE id=?', [req.params.id]);
    if (db.users) db.users = db.users.filter(u => u.id !== Number(req.params.id));

    return ok(res, { id: Number(req.params.id), deleted: true, name: row.name });
  } catch (e) { return fail(res, 500, e.message); }
};