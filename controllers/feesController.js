'use strict';
/**
 * feesController.js — Sacred Heart College (SAHARCO)
 */
const db = require('../config/db');
const fail = (res, s, m) => res.status(s).json({ success: false, message: m });
const ok   = (res, data, meta = {}, s = 200) => res.status(s).json({ success: true, ...meta, data });

/* ── Auto-create tables if they don't exist ──────────────────────────── */
let _tablesReady = false;
async function ensureTables() {
  if (_tablesReady) return;
  const run = sql => db.run(sql).catch(e => console.warn('[fees] ensureTable:', e.message));

  await run(`CREATE TABLE IF NOT EXISTS fee_structure (
    id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    label       VARCHAR(120) NOT NULL,
    amount      DECIMAL(12,2) NOT NULL DEFAULT 0,
    level       VARCHAR(20)  DEFAULT 'All',
    class_name  VARCHAR(60)  DEFAULT NULL,
    term        VARCHAR(30)  DEFAULT NULL,
    session     VARCHAR(20)  DEFAULT NULL,
    mandatory   TINYINT(1)   NOT NULL DEFAULT 1,
    description TEXT,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  await run(`CREATE TABLE IF NOT EXISTS fee_payments (
    id           VARCHAR(40)   NOT NULL PRIMARY KEY,
    student_id   VARCHAR(30)   NOT NULL,
    fee_type     VARCHAR(120)  NOT NULL,
    amount       DECIMAL(12,2) NOT NULL DEFAULT 0,
    payment_date DATE,
    term         VARCHAR(30)   DEFAULT NULL,
    session      VARCHAR(20)   DEFAULT NULL,
    status       VARCHAR(20)   NOT NULL DEFAULT 'Unpaid',
    reference    VARCHAR(120)  DEFAULT NULL,
    note         TEXT,
    created_by   VARCHAR(80)   DEFAULT NULL,
    created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  await run(`CREATE TABLE IF NOT EXISTS fee_ledger (
    id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    student_id    VARCHAR(30)   NOT NULL,
    payment_id    VARCHAR(40)   DEFAULT NULL,
    entry_type    VARCHAR(20)   NOT NULL DEFAULT 'charge',
    description   VARCHAR(255)  NOT NULL,
    debit         DECIMAL(12,2) NOT NULL DEFAULT 0,
    credit        DECIMAL(12,2) NOT NULL DEFAULT 0,
    balance       DECIMAL(12,2) NOT NULL DEFAULT 0,
    term          VARCHAR(30)   DEFAULT NULL,
    session       VARCHAR(20)   DEFAULT NULL,
    academic_year VARCHAR(20)   DEFAULT NULL,
    class_at_time VARCHAR(60)   DEFAULT NULL,
    reference     VARCHAR(120)  DEFAULT NULL,
    created_by    VARCHAR(80)   DEFAULT NULL,
    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  // Add any missing columns to fee_ledger (if table pre-existed with old schema)
  for (const col of [
    "ALTER TABLE fee_ledger ADD COLUMN IF NOT EXISTS payment_id    VARCHAR(40) DEFAULT NULL",
    "ALTER TABLE fee_ledger ADD COLUMN IF NOT EXISTS academic_year VARCHAR(20) DEFAULT NULL",
    "ALTER TABLE fee_ledger ADD COLUMN IF NOT EXISTS class_at_time VARCHAR(60) DEFAULT NULL",
    "ALTER TABLE fee_ledger ADD COLUMN IF NOT EXISTS created_by    VARCHAR(80) DEFAULT NULL",
    "ALTER TABLE fee_payments ADD COLUMN IF NOT EXISTS note TEXT",
    "ALTER TABLE fee_payments ADD COLUMN IF NOT EXISTS created_by VARCHAR(80) DEFAULT NULL",
  ]) { await run(col); }

  await run(`CREATE TABLE IF NOT EXISTS levy_payments (
    id           VARCHAR(40)   NOT NULL PRIMARY KEY,
    student_id   VARCHAR(30)   NOT NULL,
    levy_name    VARCHAR(120)  NOT NULL,
    category     VARCHAR(60)   DEFAULT NULL,
    amount_paid  DECIMAL(12,2) NOT NULL DEFAULT 0,
    due_date     DATE          DEFAULT NULL,
    term         VARCHAR(30)   DEFAULT NULL,
    session      VARCHAR(20)   DEFAULT NULL,
    status       VARCHAR(20)   NOT NULL DEFAULT 'Unpaid',
    reference    VARCHAR(120)  DEFAULT NULL,
    created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  _tablesReady = true;
  console.log('[fees] tables ensured');
}



/** GET /api/fees/structure?level=&class=&term=&session= */
exports.getStructure = async (req, res) => {
  await ensureTables();
  try {
    const { level, class: cls, term, session } = req.query;
    let sql = 'SELECT * FROM fee_structure WHERE 1=1';
    const p = [];
    if (level)   { sql += ' AND (level=? OR level="All")'; p.push(level); }
    if (cls)     { sql += ' AND (class_name=? OR class_name IS NULL)'; p.push(cls); }
    if (term)    { sql += ' AND (term=? OR term IS NULL)'; p.push(term); }
    if (session) { sql += ' AND (session=? OR session IS NULL)'; p.push(session); }
    sql += ' ORDER BY ISNULL(class_name), class_name, label';
    const rows = await db.query(sql, p);
    return ok(res, rows, { count: rows.length });
  } catch (e) { return fail(res, 500, e.message); }
};

/** POST /api/fees/structure — create fee structure item */
exports.addStructureItem = async (req, res) => {
  await ensureTables();
  try {
    const { label, amount, level = 'All', class_name, term, session, mandatory = 1, description } = req.body ?? {};
    if (!label || amount == null) return fail(res, 400, 'label and amount are required.');
    const result = await db.run(
      `INSERT INTO fee_structure (label, amount, level, class_name, term, session, mandatory, description)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [label, parseFloat(amount), level, class_name || null, term || null, session || null, mandatory ? 1 : 0, description || null]
    );
    const item = await db.query1('SELECT * FROM fee_structure WHERE id=?', [result.insertId]);

    // Auto-charge all applicable students immediately
    const charged = await _autoChargeStudents({
      feeType:   label,
      amount:    parseFloat(amount),
      level:     class_name ? 'Class' : level,
      className: class_name || null,
      term:      term    || null,
      session:   session || null,
      createdBy: req.user?.name || null,
    });

    return ok(res, { ...item, autoCharged: charged }, { charged }, 201);
  } catch (e) { return fail(res, 500, e.message); }
};

/** PUT /api/fees/structure/:id */
exports.updateStructureItem = async (req, res) => {
  await ensureTables();
  try {
    const row = await db.query1('SELECT * FROM fee_structure WHERE id=?', [req.params.id]);
    if (!row) return fail(res, 404, 'Fee structure item not found.');
    const fields = ['label','amount','level','class_name','term','session','mandatory','description'];
    const sets = [], vals = [];
    fields.forEach(f => {
      if (req.body[f] !== undefined) {
        sets.push(`${f}=?`);
        vals.push(f === 'amount' ? parseFloat(req.body[f]) : req.body[f]);
      }
    });
    if (!sets.length) return fail(res, 400, 'No fields to update.');
    vals.push(req.params.id);
    await db.run(`UPDATE fee_structure SET ${sets.join(',')} WHERE id=?`, vals);
    const updated = await db.query1('SELECT * FROM fee_structure WHERE id=?', [req.params.id]);
    return ok(res, updated);
  } catch (e) { return fail(res, 500, e.message); }
};

/** DELETE /api/fees/structure/:id */
exports.deleteStructureItem = async (req, res) => {
  await ensureTables();
  try {
    const row = await db.query1('SELECT id FROM fee_structure WHERE id=?', [req.params.id]);
    if (!row) return fail(res, 404, 'Fee structure item not found.');
    await db.run('DELETE FROM fee_structure WHERE id=?', [req.params.id]);
    return ok(res, { id: Number(req.params.id), deleted: true });
  } catch (e) { return fail(res, 500, e.message); }
};

/** GET /api/fees/structure/for-class?class=&term=&session=
 *  Returns all fee items that apply to a specific class.
 *  Combines: items targeting the class directly + items for its level + items with no class filter */
exports.getStructureForClass = async (req, res) => {
  await ensureTables();
  try {
    const { class: cls, term, session } = req.query;
    if (!cls) return fail(res, 400, 'class is required.');

    // Determine level
    const classRow = await db.query1('SELECT * FROM classes WHERE name=?', [cls]);
    const level = classRow?.level || 'All';

    const sql = `
      SELECT * FROM fee_structure
      WHERE (class_name = ? OR class_name IS NULL)
        AND (level = ? OR level = 'All')
        AND (term IS NULL OR term = ?)
        AND (session IS NULL OR session = ?)
      ORDER BY class_name IS NULL, label`;
    const rows = await db.query(sql, [cls, level, term || '', session || '']);
    const total = rows.reduce((a, r) => a + parseFloat(r.amount), 0);
    return ok(res, rows, { class: cls, level, totalExpected: total });
  } catch (e) { return fail(res, 500, e.message); }
};

/** POST /api/fees/structure/assign-class — bulk-assign a fee to an entire class */
exports.assignFeeToClass = async (req, res) => {
  await ensureTables();
  try {
    const { class_name, label, amount, term, session, mandatory = 1, description } = req.body ?? {};
    if (!class_name || !label || amount == null)
      return fail(res, 400, 'class_name, label, amount are required.');

    const classRow = await db.query1('SELECT level FROM classes WHERE name=?', [class_name]);
    if (!classRow) return fail(res, 404, `Class "${class_name}" not found.`);

    const result = await db.run(
      `INSERT INTO fee_structure (label, amount, level, class_name, term, session, mandatory, description)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [label, parseFloat(amount), classRow.level, class_name, term || null, session || null, mandatory ? 1 : 0, description || null]
    );
    const item = await db.query1('SELECT * FROM fee_structure WHERE id=?', [result.insertId]);
    return ok(res, item, { message: `Fee "${label}" assigned to ${class_name}.` }, 201);
  } catch (e) { return fail(res, 500, e.message); }
};

/** POST /api/fees/structure/assign-level — assign a fee to all classes of a level (Junior/Senior/All) */
exports.assignFeeToLevel = async (req, res) => {
  await ensureTables();
  try {
    const { level, label, amount, term, session, mandatory = 1, description } = req.body ?? {};
    if (!level || !label || amount == null)
      return fail(res, 400, 'level, label, amount are required.');

    const result = await db.run(
      `INSERT INTO fee_structure (label, amount, level, class_name, term, session, mandatory, description)
       VALUES (?, ?, ?, NULL, ?, ?, ?, ?)`,
      [label, parseFloat(amount), level, term || null, session || null, mandatory ? 1 : 0, description || null]
    );
    const item = await db.query1('SELECT * FROM fee_structure WHERE id=?', [result.insertId]);
    return ok(res, item, { message: `Fee "${label}" assigned to all ${level} classes.` }, 201);
  } catch (e) { return fail(res, 500, e.message); }
};

/* ══════════════════════════════════════════════════════════════════════════
   FEE PAYMENTS
══════════════════════════════════════════════════════════════════════════ */

/** GET /api/fees?studentId=&class=&arm=&term=&session=&status=&feeType= */
exports.getAll = async (req, res) => {
  await ensureTables();
  try {
    const { studentId, class: cls, arm, term, session, status, feeType, search } = req.query;
    let sql = `SELECT f.*, s.name AS student_name, c.name AS class_name, s.arm AS student_arm
               FROM fee_payments f
               JOIN students s ON s.id=f.student_id
               LEFT JOIN classes c ON c.id=s.class_id
               WHERE 1=1`;
    const p = [];
    if (studentId) { sql += ' AND f.student_id=?';  p.push(studentId); }
    if (cls)       { sql += ' AND c.name=?';         p.push(cls); }
    if (arm)       { sql += ' AND s.arm=?';          p.push(arm); }
    if (term)      { sql += ' AND f.term=?';         p.push(term); }
    if (session)   { sql += ' AND f.session=?';      p.push(session); }
    if (status)    { sql += ' AND f.status=?';       p.push(status); }
    if (feeType)   { sql += ' AND f.fee_type=?';     p.push(feeType); }
    if (search)    { sql += ' AND (s.name LIKE ? OR f.reference LIKE ? OR f.fee_type LIKE ?)';
                     const q = `%${search}%`; p.push(q, q, q); }
    sql += ' ORDER BY f.created_at DESC';
    const rows = await db.query(sql, p);
    const totalAmt = rows.reduce((a, r) => a + parseFloat(r.amount || 0), 0);
    return ok(res, rows, { count: rows.length, totalAmount: totalAmt });
  } catch (e) { return fail(res, 500, e.message); }
};

/** GET /api/fees/:id */
exports.getOne = async (req, res) => {
  await ensureTables();
  try {
    const row = await db.query1(
      `SELECT f.*, s.name AS student_name, c.name AS class_name, s.arm AS student_arm
       FROM fee_payments f JOIN students s ON s.id=f.student_id
       LEFT JOIN classes c ON c.id=s.class_id WHERE f.id=?`, [req.params.id]);
    if (!row) return fail(res, 404, 'Payment record not found.');
    return ok(res, row);
  } catch (e) { return fail(res, 500, e.message); }
};

/** POST /api/fees — record a payment and add ledger entry */
exports.create = async (req, res) => {
  await ensureTables();
  try {
    const { studentId, feeType, amount, date, term, session,
            status = 'Paid', reference, note } = req.body ?? {};
    if (!studentId || !feeType || !amount || !date || !term)
      return fail(res, 400, 'studentId, feeType, amount, date, term are required.');

    const student = await db.query1(
      `SELECT s.*, c.name AS class_name FROM students s LEFT JOIN classes c ON c.id=s.class_id WHERE s.id=?`,
      [studentId]
    );
    if (!student) return fail(res, 404, 'Student not found.');

    const id = `FEE${Date.now()}`;
    await db.run(
      `INSERT INTO fee_payments (id, student_id, fee_type, amount, payment_date, term, session, status, reference, note, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, studentId, feeType, parseFloat(amount), date, term, session || null,
       status, reference || null, note || null, req.user?.name || null]
    );

    // Add ledger entry
    const isCredit = ['Paid','Partial','Waived'].includes(status);
    await _addLedgerEntry({
      studentId, paymentId: id,
      entryType: status === 'Waived' ? 'waiver' : 'payment',
      description: `${feeType} — ${term}${session ? ' ' + session : ''}`,
      debit:  isCredit ? 0 : parseFloat(amount),
      credit: isCredit ? parseFloat(amount) : 0,
      term, session, classAtTime: student.class_name,
      reference, createdBy: req.user?.name || null,
    });

    const saved = await db.query1(
      `SELECT f.*, s.name AS student_name FROM fee_payments f JOIN students s ON s.id=f.student_id WHERE f.id=?`, [id]);
    return ok(res, saved, {}, 201);
  } catch (e) { return fail(res, 500, e.message); }
};

/** POST /api/fees/bulk-charge — charge a fee to all students in a class/arm */
exports.bulkCharge = async (req, res) => {
  await ensureTables();
  try {
    const { class: cls, arm, feeType, amount, term, session, dueDate } = req.body ?? {};
    if (!feeType || !amount || !term)
      return fail(res, 400, 'feeType, amount, term are required.');

    const students = await db.query(
      `SELECT s.*, c.name AS class_name FROM students s LEFT JOIN classes c ON c.id=s.class_id
       WHERE COALESCE(s.active,1)=1${cls ? ' AND c.name=?' : ''}${arm ? ' AND s.arm=?' : ''} ORDER BY s.name`,
      [...(cls ? [cls] : []), ...(arm ? [arm] : [])]
    );
    if (!students.length) return ok(res, { charged: 0, skipped: 0, students: [] },
      { message: `No active students found${cls ? ' in ' + cls : ''}${arm ? ' ' + arm : ''}.` });

    const charged = [], skipped = [];
    for (const student of students) {
      // Skip if already charged this fee this term/session
      const existing = await db.query1(
        'SELECT id FROM fee_payments WHERE student_id=? AND fee_type=? AND term=? AND session=?',
        [student.id, feeType, term, session || '']
      );
      if (existing) { skipped.push(student.id); continue; }

      const id = `FEE${Date.now()}${Math.floor(Math.random() * 1000)}`;
      await db.run(
        `INSERT INTO fee_payments (id, student_id, fee_type, amount, payment_date, term, session, status, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'Unpaid', ?)`,
        [id, student.id, feeType, parseFloat(amount), dueDate || new Date().toISOString().slice(0,10),
         term, session || null, req.user?.name || null]
      );
      await _addLedgerEntry({
        studentId: student.id, paymentId: id, entryType: 'charge',
        description: `${feeType} — ${term}${session ? ' ' + session : ''}`,
        debit: parseFloat(amount), credit: 0,
        term, session, classAtTime: student.class_name,
        createdBy: req.user?.name || null,
      });
      charged.push(student.id);
    }

    return ok(res, { charged: charged.length, skipped: skipped.length, students: charged },
      { message: `Charged ${charged.length} students, skipped ${skipped.length} (already charged).` }, 201);
  } catch (e) { return fail(res, 500, e.message); }
};

/** PUT /api/fees/:id */
exports.update = async (req, res) => {
  await ensureTables();
  try {
    const row = await db.query1('SELECT * FROM fee_payments WHERE id=?', [req.params.id]);
    if (!row) return fail(res, 404, 'Payment not found.');
    const { feeType, amount, date, term, session, status, reference, note } = req.body ?? {};
    await db.run(
      `UPDATE fee_payments SET fee_type=?, amount=?, payment_date=?, term=?, session=?, status=?, reference=?, note=? WHERE id=?`,
      [feeType||row.fee_type, amount!=null?parseFloat(amount):row.amount, date||row.payment_date,
       term||row.term, session||row.session, status||row.status, reference||row.reference, note||row.note, req.params.id]
    );
    const updated = await db.query1(
      `SELECT f.*, s.name AS student_name FROM fee_payments f JOIN students s ON s.id=f.student_id WHERE f.id=?`,
      [req.params.id]);
    return ok(res, updated);
  } catch (e) { return fail(res, 500, e.message); }
};

/** PATCH /api/fees/:id/status */
exports.updateStatus = async (req, res) => {
  await ensureTables();
  try {
    const { status } = req.body ?? {};
    if (!['Paid','Partial','Unpaid','Waived','overdue'].includes(status))
      return fail(res, 400, 'Invalid status.');
    const row = await db.query1('SELECT * FROM fee_payments WHERE id=?', [req.params.id]);
    if (!row) return fail(res, 404, 'Payment not found.');
    await db.run('UPDATE fee_payments SET status=? WHERE id=?', [status, req.params.id]);

    // Add ledger entry for status change to Paid/Waived
    if (['Paid','Waived'].includes(status) && !['Paid','Waived'].includes(row.status)) {
      await _addLedgerEntry({
        studentId: row.student_id, paymentId: row.id,
        entryType: status === 'Waived' ? 'waiver' : 'payment',
        description: `${row.fee_type} — marked ${status}`,
        debit: 0, credit: parseFloat(row.amount),
        term: row.term, session: row.session,
        createdBy: req.user?.name || null,
      });
    }
    return ok(res, { id: req.params.id, status });
  } catch (e) { return fail(res, 500, e.message); }
};

/** DELETE /api/fees/:id */
exports.remove = async (req, res) => {
  await ensureTables();
  try {
    const row = await db.query1('SELECT id FROM fee_payments WHERE id=?', [req.params.id]);
    if (!row) return fail(res, 404, 'Payment not found.');
    await db.run('DELETE FROM fee_payments WHERE id=?', [req.params.id]);
    await db.run('DELETE FROM fee_ledger WHERE payment_id=?', [req.params.id]);
    return ok(res, { id: req.params.id, deleted: true });
  } catch (e) { return fail(res, 500, e.message); }
};

/* ══════════════════════════════════════════════════════════════════════════
   FEE LEDGER — comprehensive lifetime student account
══════════════════════════════════════════════════════════════════════════ */

/** GET /api/fees/ledger/:studentId — full lifetime ledger for one student */
exports.getLedger = async (req, res) => {
  await ensureTables();
  try {
    const { studentId } = req.params;
    const { term, session, academic_year } = req.query;

    const student = await db.query1(
      `SELECT s.*, c.name AS class_name FROM students s LEFT JOIN classes c ON c.id=s.class_id WHERE s.id=?`,
      [studentId]
    );
    if (!student) return fail(res, 404, 'Student not found.');

    let sql = 'SELECT * FROM fee_ledger WHERE student_id=?';
    const p = [studentId];
    if (term)         { sql += ' AND term=?';          p.push(term); }
    if (session)      { sql += ' AND session=?';       p.push(session); }
    if (academic_year){ sql += ' AND academic_year=?'; p.push(academic_year); }
    sql += ' ORDER BY created_at ASC';

    const entries  = await db.query(sql, p);
    const totalDebit  = entries.reduce((a, e) => a + parseFloat(e.debit  || 0), 0);
    const totalCredit = entries.reduce((a, e) => a + parseFloat(e.credit || 0), 0);
    const balance     = totalDebit - totalCredit;
    const runningBalance = entries.length ? parseFloat(entries[entries.length - 1].balance) : 0;

    return ok(res, entries, {
      student:      { id: student.id, name: student.name, class: student.class_name, arm: student.arm },
      totalCharged: totalDebit,
      totalPaid:    totalCredit,
      balance:      balance,
      runningBalance,
      status:       balance <= 0 ? 'Cleared' : 'Outstanding',
    });
  } catch (e) { return fail(res, 500, e.message); }
};

/** GET /api/fees/ledger-summary — outstanding balances across all students */
exports.getLedgerSummary = async (req, res) => {
  await ensureTables();
  try {
    const { class: cls, arm, session } = req.query;
    let sql = `
      SELECT l.student_id,
             s.name AS student_name,
             c.name AS class_name,
             s.arm,
             SUM(l.debit)  AS total_charged,
             SUM(l.credit) AS total_paid,
             SUM(l.debit) - SUM(l.credit) AS balance
      FROM fee_ledger l
      JOIN students s ON s.id=l.student_id
      LEFT JOIN classes c ON c.id=s.class_id
      WHERE 1=1`;
    const p = [];
    if (cls)     { sql += ' AND c.name=?';    p.push(cls); }
    if (arm)     { sql += ' AND s.arm=?';     p.push(arm); }
    if (session) { sql += ' AND l.session=?'; p.push(session); }
    sql += ' GROUP BY l.student_id, s.name, c.name, s.arm ORDER BY balance DESC';
    const rows = await db.query(sql, p);
    const outstanding = rows.filter(r => parseFloat(r.balance) > 0);
    const totalOutstanding = outstanding.reduce((a, r) => a + parseFloat(r.balance), 0);
    return ok(res, rows, { outstanding: outstanding.length, totalOutstanding });
  } catch (e) { return fail(res, 500, e.message); }
};

/** POST /api/fees/ledger/adjustment — manual debit or credit adjustment */
exports.addLedgerAdjustment = async (req, res) => {
  await ensureTables();
  try {
    const { studentId, type, amount, description, term, session, reference } = req.body ?? {};
    if (!studentId || !type || !amount || !description)
      return fail(res, 400, 'studentId, type (debit|credit), amount, description are required.');
    if (!['debit','credit','refund'].includes(type))
      return fail(res, 400, 'type must be debit, credit, or refund.');

    const student = await db.query1('SELECT id FROM students WHERE id=?', [studentId]);
    if (!student) return fail(res, 404, 'Student not found.');

    const entryType = type === 'debit' ? 'charge' : type === 'refund' ? 'refund' : 'adjustment';
    const debit  = type === 'debit'  ? parseFloat(amount) : 0;
    const credit = type !== 'debit'  ? parseFloat(amount) : 0;

    const entry = await _addLedgerEntry({
      studentId, entryType, description,
      debit, credit, term, session, reference,
      createdBy: req.user?.name || null,
    });
    return ok(res, entry, {}, 201);
  } catch (e) { return fail(res, 500, e.message); }
};

/* ══════════════════════════════════════════════════════════════════════════
   SUMMARY / REPORTS
══════════════════════════════════════════════════════════════════════════ */

/** GET /api/fees/summary?term=&session=&class= */
exports.getSummary = async (req, res) => {
  await ensureTables();
  try {
    const { term, session, class: cls } = req.query;
    let sql = `SELECT f.fee_type,
       COUNT(*)                                                  AS count,
       SUM(f.amount)                                            AS total,
       SUM(CASE WHEN f.status='Paid'    THEN f.amount ELSE 0 END) AS paid,
       SUM(CASE WHEN f.status='Unpaid'  THEN f.amount ELSE 0 END) AS unpaid,
       SUM(CASE WHEN f.status='Partial' THEN f.amount ELSE 0 END) AS partial
       FROM fee_payments f
       JOIN students s ON s.id=f.student_id
       LEFT JOIN classes c ON c.id=s.class_id
       WHERE 1=1`;
    const p = [];
    if (term)    { sql += ' AND f.term=?';  p.push(term); }
    if (session) { sql += ' AND f.session=?'; p.push(session); }
    if (cls)     { sql += ' AND c.name=?';  p.push(cls); }
    sql += ' GROUP BY f.fee_type ORDER BY total DESC';
    const rows = await db.query(sql, p);
    const grand = rows.reduce((a, r) => ({
      total: a.total + parseFloat(r.total), paid: a.paid + parseFloat(r.paid),
      unpaid: a.unpaid + parseFloat(r.unpaid),
    }), { total: 0, paid: 0, unpaid: 0 });
    return ok(res, rows, { grandTotal: grand.total, grandPaid: grand.paid, grandUnpaid: grand.unpaid });
  } catch (e) { return fail(res, 500, e.message); }
};

/** GET /api/fees/student/:studentId — all payments + lifetime stats */
exports.getByStudent = async (req, res) => {
  await ensureTables();
  try {
    const { studentId } = req.params;
    const { term, session } = req.query;
    let sql = 'SELECT * FROM fee_payments WHERE student_id=?';
    const p = [studentId];
    if (term)    { sql += ' AND term=?';    p.push(term); }
    if (session) { sql += ' AND session=?'; p.push(session); }
    sql += ' ORDER BY created_at DESC';
    const rows = await db.query(sql, p);
    const total   = rows.reduce((a, r) => a + parseFloat(r.amount), 0);
    const paid    = rows.filter(r => r.status === 'Paid').reduce((a, r) => a + parseFloat(r.amount), 0);
    const unpaid  = rows.filter(r => r.status === 'Unpaid').reduce((a, r) => a + parseFloat(r.amount), 0);
    return ok(res, rows, { total, paid, unpaid, balance: total - paid });
  } catch (e) { return fail(res, 500, e.message); }
};

/** GET /api/fees/export/csv */
exports.exportCSV = async (req, res) => {
  await ensureTables();
  try {
    const { term, session, class: cls } = req.query;
    let sql = `SELECT f.*, s.name AS student_name, c.name AS class_name, s.arm
               FROM fee_payments f JOIN students s ON s.id=f.student_id
               LEFT JOIN classes c ON c.id=s.class_id WHERE 1=1`;
    const p = [];
    if (term)    { sql += ' AND f.term=?';    p.push(term); }
    if (session) { sql += ' AND f.session=?'; p.push(session); }
    if (cls)     { sql += ' AND c.name=?';    p.push(cls); }
    sql += ' ORDER BY s.name, f.created_at DESC';
    const rows = await db.query(sql, p);
    const headers = ['Receipt ID','Student','Class','Arm','Fee Type','Amount (₦)','Date','Term','Session','Status','Reference','Note'];
    const lines = [headers.join(','), ...rows.map(r => [
      r.id, `"${r.student_name}"`, r.class_name || '', r.arm || '',
      `"${r.fee_type}"`, r.amount, r.payment_date, r.term, r.session || '',
      r.status, r.reference || '', `"${(r.note || '').replace(/"/g, '""')}"`,
    ].join(','))];
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="fees_report.csv"');
    return res.send('\uFEFF' + lines.join('\n'));
  } catch (e) { return fail(res, 500, e.message); }
};

/** GET /api/fees/ledger-export/:studentId — export student lifetime ledger as CSV */
exports.exportLedgerCSV = async (req, res) => {
  await ensureTables();
  try {
    const student = await db.query1('SELECT * FROM students WHERE id=?', [req.params.studentId]);
    if (!student) return fail(res, 404, 'Student not found.');
    const entries = await db.query(
      'SELECT * FROM fee_ledger WHERE student_id=? ORDER BY created_at ASC',
      [req.params.studentId]
    );
    const headers = ['Date','Type','Description','Debit (₦)','Credit (₦)','Balance (₦)','Term','Session','Class','Reference'];
    const lines = [headers.join(','), ...entries.map(e => [
      new Date(e.created_at).toLocaleDateString(), e.entry_type,
      `"${e.description}"`, e.debit || 0, e.credit || 0, e.balance || 0,
      e.term || '', e.session || '', e.class_at_time || '', e.reference || '',
    ].join(','))];
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="ledger_${student.name.replace(/\s+/g,'_')}.csv"`);
    return res.send('\uFEFF' + lines.join('\n'));
  } catch (e) { return fail(res, 500, e.message); }
};

/* ══════════════════════════════════════════════════════════════════════════
   INTERNAL HELPER — add ledger entry with running balance
══════════════════════════════════════════════════════════════════════════ */
/* ── Auto-charge students when a fee template is created ────────────────── */
async function _autoChargeStudents({ feeType, amount, level, className, term, session, createdBy }) {
  try {
    // Build student query based on who this fee targets
    let sql = `SELECT s.*, c.name AS class_name, c.level AS class_level
               FROM students s LEFT JOIN classes c ON c.id = s.class_id
               WHERE COALESCE(s.active, 1) = 1`;
    const p = [];

    if (className) {
      sql += ' AND c.name = ?';
      p.push(className);
    } else if (level && level !== 'All') {
      sql += ' AND c.level = ?';
      p.push(level);
    }

    const students = await db.query(sql, p);
    let charged = 0;

    for (const student of students) {
      // Skip if already charged this fee this term+session
      const exists = await db.query1(
        `SELECT id FROM fee_payments WHERE student_id=? AND fee_type=? AND term=? AND (session=? OR (session IS NULL AND ? IS NULL))`,
        [student.id, feeType, term || '', session || null, session || null]
      );
      if (exists) continue;

      const id = `FEE${Date.now()}${Math.floor(Math.random() * 9999)}`;
      await db.run(
        `INSERT INTO fee_payments (id, student_id, fee_type, amount, payment_date, term, session, status, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'Unpaid', ?)`,
        [id, student.id, feeType, amount,
         new Date().toISOString().slice(0, 10),
         term || null, session || null, createdBy || null]
      );
      await _addLedgerEntry({
        studentId:   student.id,
        paymentId:   id,
        entryType:   'charge',
        description: `${feeType}${term ? ' — ' + term : ''}${session ? ' / ' + session : ''}`,
        debit:       amount,
        credit:      0,
        term, session,
        classAtTime: student.class_name,
        createdBy,
      });
      charged++;
    }
    return charged;
  } catch(e) {
    console.error('[autoCharge]', e.message);
    return 0;
  }
}

async function _addLedgerEntry({ studentId, paymentId, entryType, description,
  debit, credit, term, session, classAtTime, reference, createdBy }) {
  // Get last balance for this student
  const last = await db.query1(
    'SELECT balance FROM fee_ledger WHERE student_id=? ORDER BY id DESC LIMIT 1',
    [studentId]
  );
  const prevBalance = last ? parseFloat(last.balance) : 0;
  const newBalance  = prevBalance + parseFloat(debit || 0) - parseFloat(credit || 0);

  // Determine academic year from session
  const academicYear = session || (term ? null : null);

  await db.run(
    `INSERT INTO fee_ledger
     (student_id, payment_id, entry_type, description, debit, credit, balance,
      term, session, academic_year, class_at_time, reference, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [studentId, paymentId || null, entryType, description,
     parseFloat(debit || 0), parseFloat(credit || 0), newBalance,
     term || null, session || null, academicYear || null,
     classAtTime || null, reference || null, createdBy || null]
  );

  return { studentId, entryType, debit, credit, balance: newBalance };
}