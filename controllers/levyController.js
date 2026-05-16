'use strict';
/**
 * levyController.js — Special one-off fees (sports, graduation, interhouse, etc.)
 */
const db   = require('../config/db');
const fail = (res, s, m) => res.status(s).json({ success: false, message: m });
const ok   = (res, data, meta = {}, s = 200) => res.status(s).json({ success: true, ...meta, data });

const VALID_CATEGORIES = ['Sports','Graduation','Cultural','Interhouse','Excursion','Uniform','ID Card','Library','Technology','Medical','Other'];
const VALID_TARGETS    = ['All','Junior','Senior','Class','Individual'];

/* ── GET /api/levies ─────────────────────────────────────────────────────── */
exports.getAll = async (req, res) => {
  try {
    const { category, target, session, active } = req.query;
    let sql = 'SELECT * FROM levies WHERE 1=1';
    const p = [];
    if (category) { sql += ' AND category=?'; p.push(category); }
    if (target)   { sql += ' AND target=?';   p.push(target); }
    if (session)  { sql += ' AND session=?';  p.push(session); }
    if (active != null) { sql += ' AND active=?'; p.push(active === 'true' || active === '1' ? 1 : 0); }
    sql += ' ORDER BY created_at DESC';
    const rows = await db.query(sql, p);
    return ok(res, rows, { count: rows.length });
  } catch (e) { return fail(res, 500, e.message); }
};

/* ── GET /api/levies/:id ─────────────────────────────────────────────────── */
exports.getOne = async (req, res) => {
  try {
    const row = await db.query1('SELECT * FROM levies WHERE id=?', [req.params.id]);
    if (!row) return fail(res, 404, 'Levy not found.');
    return ok(res, row);
  } catch (e) { return fail(res, 500, e.message); }
};

/* ── POST /api/levies — create a levy ───────────────────────────────────── */
exports.create = async (req, res) => {
  try {
    const { name, category = 'Other', amount, target = 'All', class_name,
            arm, term, session, due_date, description, mandatory = 1 } = req.body ?? {};
    if (!name || amount == null) return fail(res, 400, 'name and amount are required.');
    if (!VALID_CATEGORIES.includes(category)) return fail(res, 400, `category must be one of: ${VALID_CATEGORIES.join(', ')}`);
    if (!VALID_TARGETS.includes(target))      return fail(res, 400, `target must be one of: ${VALID_TARGETS.join(', ')}`);
    if (target === 'Class' && !class_name)    return fail(res, 400, 'class_name is required when target is Class.');

    const result = await db.run(
      `INSERT INTO levies (name, category, amount, target, class_name, arm, term, session,
        due_date, description, mandatory, active, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
      [name, category, parseFloat(amount), target, class_name || null, arm || null,
       term || null, session || null, due_date || null, description || null,
       mandatory ? 1 : 0, req.user?.name || null]
    );
    const saved = await db.query1('SELECT * FROM levies WHERE id=?', [result.insertId]);
    return ok(res, saved, {}, 201);
  } catch (e) { return fail(res, 500, e.message); }
};

/* ── PUT /api/levies/:id ─────────────────────────────────────────────────── */
exports.update = async (req, res) => {
  try {
    const row = await db.query1('SELECT * FROM levies WHERE id=?', [req.params.id]);
    if (!row) return fail(res, 404, 'Levy not found.');
    const fields = ['name','category','amount','target','class_name','arm','term','session','due_date','description','mandatory','active'];
    const sets = [], vals = [];
    fields.forEach(f => {
      if (req.body[f] !== undefined) {
        sets.push(`${f}=?`);
        vals.push(f === 'amount' ? parseFloat(req.body[f]) : req.body[f]);
      }
    });
    if (!sets.length) return fail(res, 400, 'No fields to update.');
    vals.push(req.params.id);
    await db.run(`UPDATE levies SET ${sets.join(',')} WHERE id=?`, vals);
    const updated = await db.query1('SELECT * FROM levies WHERE id=?', [req.params.id]);
    return ok(res, updated);
  } catch (e) { return fail(res, 500, e.message); }
};

/* ── DELETE /api/levies/:id ─────────────────────────────────────────────── */
exports.remove = async (req, res) => {
  try {
    const row = await db.query1('SELECT id FROM levies WHERE id=?', [req.params.id]);
    if (!row) return fail(res, 404, 'Levy not found.');
    await db.run('DELETE FROM levies WHERE id=?', [req.params.id]);
    return ok(res, { id: Number(req.params.id), deleted: true });
  } catch (e) { return fail(res, 500, e.message); }
};

/* ── POST /api/levies/:id/charge — charge levy to applicable students ──── */
exports.chargeLevy = async (req, res) => {
  try {
    const levy = await db.query1('SELECT * FROM levies WHERE id=?', [req.params.id]);
    if (!levy) return fail(res, 404, 'Levy not found.');

    let studentSql = `SELECT s.*, c.name AS class_name FROM students s
                      LEFT JOIN classes c ON c.id=s.class_id WHERE s.active=1`;
    const p = [];
    if (levy.target === 'Class' && levy.class_name) {
      studentSql += ' AND c.name=?'; p.push(levy.class_name);
      if (levy.arm) { studentSql += ' AND s.arm=?'; p.push(levy.arm); }
    } else if (levy.target === 'Junior') {
      studentSql += " AND c.level='Junior'";
    } else if (levy.target === 'Senior') {
      studentSql += " AND c.level='Senior'";
    }

    const students = await db.query(studentSql, p);
    if (!students.length) return fail(res, 404, 'No eligible students found.');

    const charged = [], skipped = [];
    for (const student of students) {
      const exists = await db.query1('SELECT id FROM levy_payments WHERE levy_id=? AND student_id=?',
        [levy.id, student.id]);
      if (exists) { skipped.push(student.id); continue; }
      const pmtId = `LVY${levy.id}_${student.id}_${Date.now()}`.slice(0, 30);
      await db.run(
        `INSERT INTO levy_payments (id, levy_id, student_id, amount_paid, payment_date, status, created_by)
         VALUES (?, ?, ?, ?, CURDATE(), 'Unpaid', ?)`,
        [pmtId, levy.id, student.id, levy.amount, req.user?.name || null]
      );
      charged.push(student.id);
    }
    return ok(res, { charged: charged.length, skipped: skipped.length },
      { message: `Charged ${charged.length} students, skipped ${skipped.length}.` });
  } catch (e) { return fail(res, 500, e.message); }
};

/* ── GET /api/levies/:id/payments — see who paid ────────────────────────── */
exports.getLevyPayments = async (req, res) => {
  try {
    const levy = await db.query1('SELECT * FROM levies WHERE id=?', [req.params.id]);
    if (!levy) return fail(res, 404, 'Levy not found.');
    const rows = await db.query(
      `SELECT lp.*, s.name AS student_name, c.name AS class_name, s.arm
       FROM levy_payments lp
       JOIN students s ON s.id=lp.student_id
       LEFT JOIN classes c ON c.id=s.class_id
       WHERE lp.levy_id=? ORDER BY s.name`,
      [levy.id]
    );
    const paid   = rows.filter(r => r.status === 'Paid').length;
    const unpaid = rows.filter(r => r.status === 'Unpaid').length;
    const total  = rows.reduce((a, r) => a + parseFloat(r.amount_paid || 0), 0);
    return ok(res, rows, { total: rows.length, paid, unpaid, totalAmount: total, levy });
  } catch (e) { return fail(res, 500, e.message); }
};

/* ── PATCH /api/levies/payments/:pmtId — mark paid/unpaid ───────────────── */
exports.updatePayment = async (req, res) => {
  try {
    const { status, reference, note, amount_paid } = req.body ?? {};
    const valid = ['Paid','Partial','Unpaid','Waived','Exempt'];
    if (status && !valid.includes(status)) return fail(res, 400, `status must be one of: ${valid.join(', ')}`);
    const row = await db.query1('SELECT * FROM levy_payments WHERE id=?', [req.params.pmtId]);
    if (!row) return fail(res, 404, 'Payment record not found.');
    const sets = [], vals = [];
    if (status)     { sets.push('status=?');       vals.push(status); }
    if (reference)  { sets.push('reference=?');    vals.push(reference); }
    if (note)       { sets.push('note=?');         vals.push(note); }
    if (amount_paid != null) { sets.push('amount_paid=?'); vals.push(parseFloat(amount_paid)); }
    if (!sets.length) return fail(res, 400, 'No fields to update.');
    vals.push(req.params.pmtId);
    await db.run(`UPDATE levy_payments SET ${sets.join(',')} WHERE id=?`, vals);
    const updated = await db.query1('SELECT * FROM levy_payments WHERE id=?', [req.params.pmtId]);
    return ok(res, updated);
  } catch (e) { return fail(res, 500, e.message); }
};

/* ── GET /api/levies/student/:studentId — all levies for one student ─────── */
exports.getStudentLevies = async (req, res) => {
  try {
    const rows = await db.query(
      `SELECT lp.*, l.name AS levy_name, l.category, l.due_date, l.description
       FROM levy_payments lp
       JOIN levies l ON l.id=lp.levy_id
       WHERE lp.student_id=? ORDER BY lp.created_at DESC`,
      [req.params.studentId]
    );
    return ok(res, rows, { count: rows.length });
  } catch (e) { return fail(res, 500, e.message); }
};