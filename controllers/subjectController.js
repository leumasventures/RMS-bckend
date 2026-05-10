'use strict';
const db = require('../config/db');
const fail = (res, s, m) => res.status(s).json({ success: false, message: m });
const ok   = (res, data, meta = {}, s = 200) => res.status(s).json({ success: true, ...meta, data });

exports.getAll = async (req, res) => {
  try {
    const { level, type, code, search } = req.query;
    let sql = 'SELECT * FROM subjects WHERE 1=1';
    const p = [];
    if (level)  { sql += ' AND level = ?'; p.push(level); }
    if (type)   { sql += ' AND type = ?';  p.push(type); }
    if (code)   { sql += ' AND code = ?';  p.push(code); }
    if (search) { sql += ' AND name LIKE ?'; p.push(`%${search}%`); }
    sql += ' ORDER BY name';
    const rows = await db.query(sql, p);
    return ok(res, rows, { count: rows.length });
  } catch (e) { return fail(res, 500, e.message); }
};

exports.getOne = async (req, res) => {
  try {
    const { id } = req.params;
    const row = await db.query1('SELECT * FROM subjects WHERE id=? OR name=? OR code=?', [id, id, id]);
    if (!row) return fail(res, 404, 'Subject not found.');
    return ok(res, row);
  } catch (e) { return fail(res, 500, e.message); }
};

exports.create = async (req, res) => {
  try {
    const { name, code, level = 'All', type = 'Core' } = req.body ?? {};
    if (!name) return fail(res, 400, 'name is required.');
    if (!code) return fail(res, 400, 'code is required.');

    const exists = await db.query1('SELECT id FROM subjects WHERE name=? OR code=?', [name, code]);
    if (exists) return fail(res, 409, 'A subject with this name or code already exists.');

    const result = await db.run('INSERT INTO subjects (name, code, level, type) VALUES (?, ?, ?, ?)', [name, code, level, type]);
    const subject = { id: result.insertId, name, code, level, type };
    db.subjects.push(subject);
    return ok(res, subject, {}, 201);
  } catch (e) { return fail(res, 500, e.message); }
};

exports.update = async (req, res) => {
  try {
    const { id } = req.params;
    const row = await db.query1('SELECT * FROM subjects WHERE id=?', [id]);
    if (!row) return fail(res, 404, 'Subject not found.');

    const name  = req.body.name  || row.name;
    const code  = req.body.code  || row.code;
    const level = req.body.level || row.level;
    const type  = req.body.type  || row.type;

    await db.run('UPDATE subjects SET name=?, code=?, level=?, type=? WHERE id=?', [name, code, level, type, id]);

    const cached = db.subjects.find(s => s.id === Number(id));
    if (cached) Object.assign(cached, { name, code, level, type });

    return ok(res, { id: Number(id), name, code, level, type });
  } catch (e) { return fail(res, 500, e.message); }
};

exports.remove = async (req, res) => {
  try {
    const { id } = req.params;
    const row = await db.query1('SELECT * FROM subjects WHERE id=?', [id]);
    if (!row) return fail(res, 404, 'Subject not found.');

    await db.run('DELETE FROM subjects WHERE id=?', [id]);
    db.subjects = db.subjects.filter(s => s.id !== Number(id));
    return ok(res, { id: Number(id), deleted: true, name: row.name });
  } catch (e) { return fail(res, 500, e.message); }
};