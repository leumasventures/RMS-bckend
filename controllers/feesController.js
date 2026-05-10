'use strict';
const db = require('../config/db');
const fail = (res, s, m) => res.status(s).json({ success: false, message: m });
const ok   = (res, data, meta = {}, s = 200) => res.status(s).json({ success: true, ...meta, data });

exports.getAll = async (req, res) => {
  try {
    const { studentId, class: cls, arm, term, session, status, feeType } = req.query;
    let sql = `SELECT f.*, s.name AS student_name, c.name AS class_name
               FROM fee_payments f JOIN students s ON s.id=f.student_id
               LEFT JOIN classes c ON c.id=s.class_id WHERE 1=1`;
    const p = [];
    if (studentId) { sql += ' AND f.student_id=?'; p.push(studentId); }
    if (cls)       { sql += ' AND c.name=?';        p.push(cls); }
    if (arm)       { sql += ' AND s.arm=?';         p.push(arm); }
    if (term)      { sql += ' AND f.term=?';        p.push(term); }
    if (session)   { sql += ' AND f.session=?';     p.push(session); }
    if (status)    { sql += ' AND f.status=?';      p.push(status); }
    if (feeType)   { sql += ' AND f.fee_type=?';    p.push(feeType); }
    sql += ' ORDER BY f.created_at DESC';
    const rows = await db.query(sql, p);
    return ok(res, rows, { count: rows.length });
  } catch (e) { return fail(res, 500, e.message); }
};

exports.getOne = async (req, res) => {
  try {
    const row = await db.query1('SELECT * FROM fee_payments WHERE id=?', [req.params.id]);
    if (!row) return fail(res, 404, 'Payment record not found.');
    return ok(res, row);
  } catch (e) { return fail(res, 500, e.message); }
};

exports.create = async (req, res) => {
  try {
    const { studentId, feeType, amount, date, term, session, status = 'Paid', reference, note } = req.body ?? {};
    if (!studentId || !feeType || !amount || !date || !term)
      return fail(res, 400, 'studentId, feeType, amount, date, term are required.');

    const student = await db.query1('SELECT id FROM students WHERE id=?', [studentId]);
    if (!student) return fail(res, 404, 'Student not found.');

    const id = `FEE${Date.now()}`;
    await db.run(
      `INSERT INTO fee_payments (id, student_id, fee_type, amount, payment_date, term, session, status, reference, note, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, studentId, feeType, parseFloat(amount), date, term, session || null, status, reference || null, note || null, req.user?.name || null]
    );
    const saved = await db.query1('SELECT * FROM fee_payments WHERE id=?', [id]);
    return ok(res, saved, {}, 201);
  } catch (e) { return fail(res, 500, e.message); }
};

exports.update = async (req, res) => {
  try {
    const { id } = req.params;
    const row = await db.query1('SELECT * FROM fee_payments WHERE id=?', [id]);
    if (!row) return fail(res, 404, 'Payment not found.');

    const { feeType, amount, date, term, session, status, reference, note } = req.body ?? {};
    await db.run(
      `UPDATE fee_payments SET fee_type=?, amount=?, payment_date=?, term=?, session=?, status=?, reference=?, note=? WHERE id=?`,
      [feeType||row.fee_type, amount||row.amount, date||row.payment_date, term||row.term,
       session||row.session, status||row.status, reference||row.reference, note||row.note, id]
    );
    return ok(res, { ...row, ...req.body });
  } catch (e) { return fail(res, 500, e.message); }
};

exports.updateStatus = async (req, res) => {
  try {
    const { status } = req.body ?? {};
    if (!['Paid','Partial','Unpaid','Waived','overdue'].includes(status)) return fail(res, 400, 'Invalid status.');
    const row = await db.query1('SELECT id FROM fee_payments WHERE id=?', [req.params.id]);
    if (!row) return fail(res, 404, 'Payment not found.');
    await db.run('UPDATE fee_payments SET status=? WHERE id=?', [status, req.params.id]);
    return ok(res, { id: req.params.id, status });
  } catch (e) { return fail(res, 500, e.message); }
};

exports.remove = async (req, res) => {
  try {
    const row = await db.query1('SELECT id FROM fee_payments WHERE id=?', [req.params.id]);
    if (!row) return fail(res, 404, 'Payment not found.');
    await db.run('DELETE FROM fee_payments WHERE id=?', [req.params.id]);
    return ok(res, { id: req.params.id, deleted: true });
  } catch (e) { return fail(res, 500, e.message); }
};

exports.getStructure = async (req, res) => {
  try {
    const rows = await db.query('SELECT * FROM fee_structure ORDER BY id');
    return ok(res, rows);
  } catch (e) { return fail(res, 500, e.message); }
};

exports.addStructureItem = async (req, res) => {
  try {
    const { label, amount, level = 'All' } = req.body ?? {};
    if (!label || !amount) return fail(res, 400, 'label and amount required.');
    const result = await db.run('INSERT INTO fee_structure (label, amount, level) VALUES (?, ?, ?)', [label, parseFloat(amount), level]);
    const item = { id: result.insertId, label, amount: parseFloat(amount), level };
    db.feeStructure.push(item);
    return ok(res, item, {}, 201);
  } catch (e) { return fail(res, 500, e.message); }
};

exports.updateStructureItem = async (req, res) => {
  try {
    const { id } = req.params;
    const row = await db.query1('SELECT * FROM fee_structure WHERE id=?', [id]);
    if (!row) return fail(res, 404, 'Fee structure item not found.');
    const label  = req.body.label  || row.label;
    const amount = req.body.amount != null ? parseFloat(req.body.amount) : parseFloat(row.amount);
    const level  = req.body.level  || row.level;
    await db.run('UPDATE fee_structure SET label=?, amount=?, level=? WHERE id=?', [label, amount, level, id]);
    const cached = db.feeStructure.find(f => f.id === Number(id));
    if (cached) Object.assign(cached, { label, amount, level });
    return ok(res, { id: Number(id), label, amount, level });
  } catch (e) { return fail(res, 500, e.message); }
};

exports.deleteStructureItem = async (req, res) => {
  try {
    const row = await db.query1('SELECT id FROM fee_structure WHERE id=?', [req.params.id]);
    if (!row) return fail(res, 404, 'Fee structure item not found.');
    await db.run('DELETE FROM fee_structure WHERE id=?', [req.params.id]);
    db.feeStructure = db.feeStructure.filter(f => f.id !== Number(req.params.id));
    return ok(res, { id: Number(req.params.id), deleted: true });
  } catch (e) { return fail(res, 500, e.message); }
};

exports.getSummary = async (req, res) => {
  try {
    const { term, session } = req.query;
    const rows = await db.query(
      `SELECT fee_type, SUM(amount) AS collected, COUNT(*) AS count,
       SUM(CASE WHEN status='Paid' THEN amount ELSE 0 END) AS paid,
       SUM(CASE WHEN status='Unpaid' THEN amount ELSE 0 END) AS unpaid
       FROM fee_payments WHERE 1=1${term?' AND term=?':''}${session?' AND session=?':''}
       GROUP BY fee_type`,
      [...(term?[term]:[]), ...(session?[session]:[])]
    );
    return ok(res, rows);
  } catch (e) { return fail(res, 500, e.message); }
};

exports.getByStudent = async (req, res) => {
  try {
    const { studentId } = req.params;
    const { term, session } = req.query;
    const rows = await db.query(
      `SELECT * FROM fee_payments WHERE student_id=?${term?' AND term=?':''}${session?' AND session=?':''}  ORDER BY created_at DESC`,
      [studentId, ...(term?[term]:[]), ...(session?[session]:[])]
    );
    const total = rows.reduce((a, r) => a + parseFloat(r.amount), 0);
    const paid  = rows.filter(r => r.status === 'Paid').reduce((a, r) => a + parseFloat(r.amount), 0);
    return ok(res, rows, { total, paid, balance: total - paid });
  } catch (e) { return fail(res, 500, e.message); }
};

exports.exportCSV = async (req, res) => {
  try {
    const { term, session } = req.query;
    const rows = await db.query(
      `SELECT f.*, s.name AS student_name, c.name AS class_name, s.arm
       FROM fee_payments f JOIN students s ON s.id=f.student_id
       LEFT JOIN classes c ON c.id=s.class_id
       WHERE 1=1${term?' AND f.term=?':''}${session?' AND f.session=?':''}
       ORDER BY s.name`,
      [...(term?[term]:[]), ...(session?[session]:[])]
    );
    const lines = ['ID,Student,Class,Arm,Fee Type,Amount,Date,Term,Session,Status,Reference'];
    rows.forEach(r => lines.push([r.id,r.student_name,r.class_name,r.arm,r.fee_type,r.amount,r.payment_date,r.term,r.session||'',r.status,r.reference||''].join(',')));
    res.setHeader('Content-Type','text/csv');
    res.setHeader('Content-Disposition','attachment; filename="fees.csv"');
    return res.send(lines.join('\n'));
  } catch (e) { return fail(res, 500, e.message); }
};