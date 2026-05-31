'use strict';
/**
 * studentFinanceController.js — Sacred Heart College (SAHARCO)
 *
 * Dedicated controller for the Student Finance Portal.
 * Aggregates fee payments, levies, ledger and stats into
 * a single student-scoped API rather than making 5+ separate calls.
 *
 * Routes (mount at /api/student-finance):
 *   GET  /api/student-finance/:studentId/summary      — full overview in one call
 *   GET  /api/student-finance/:studentId/charges      — all fee charges (fee_payments)
 *   GET  /api/student-finance/:studentId/payments     — paid records only
 *   GET  /api/student-finance/:studentId/levies       — levy_payments with levy details
 *   GET  /api/student-finance/:studentId/ledger       — full chronological ledger
 *   GET  /api/student-finance/:studentId/statement    — structured statement (all data)
 *   POST /api/student-finance/:studentId/pay          — record a payment + ledger entry
 *   POST /api/student-finance/:studentId/charge       — add a direct charge
 *   POST /api/student-finance/:studentId/adjustment   — manual ledger adjustment
 *   GET  /api/student-finance/:studentId/receipt/:id  — receipt data for one payment
 *   GET  /api/student-finance/:studentId/export       — CSV of full ledger
 */

const db   = require('../config/db');
const fail = (res, s, m) => res.status(s).json({ success: false, message: m });
const ok   = (res, data, meta = {}, s = 200) => res.status(s).json({ success: true, ...meta, data });

/* ── Auto-create tables if missing ──────────────────────────────────── */
let _tablesReady = false;
async function ensureTables() {
  if (_tablesReady) return;
  const run = sql => db.run(sql).catch(e => console.warn('[student-finance] ensureTable:', e.message));
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
  // Add missing columns to existing tables
  for (const col of [
    "ALTER TABLE fee_ledger ADD COLUMN IF NOT EXISTS payment_id    VARCHAR(40) DEFAULT NULL",
    "ALTER TABLE fee_ledger ADD COLUMN IF NOT EXISTS academic_year VARCHAR(20) DEFAULT NULL",
    "ALTER TABLE fee_ledger ADD COLUMN IF NOT EXISTS class_at_time VARCHAR(60) DEFAULT NULL",
    "ALTER TABLE fee_ledger ADD COLUMN IF NOT EXISTS created_by    VARCHAR(80) DEFAULT NULL",
    "ALTER TABLE fee_payments ADD COLUMN IF NOT EXISTS note        TEXT",
    "ALTER TABLE fee_payments ADD COLUMN IF NOT EXISTS created_by  VARCHAR(80) DEFAULT NULL",
  ]) { await run(col); }
  _tablesReady = true;
  console.log('[student-finance] tables ensured');
}

/* ── guard: caller must be Admin, or the student themselves, or their parent ── */
function canAccess(user, studentId) {
  // Admin, Bursar, Teacher, Staff: can view any student
  if (['Admin', 'Bursar', 'Teacher', 'Staff'].includes(user.role)) return true;
  // Parent: can only view their own ward
  if (user.role === 'Parent') {
    const wardId = user.wardId || user.ward_id || null;
    return wardId && String(wardId) === String(studentId);
  }
  return false;
}

/* ── helper: fetch and enrich student row ── */
async function getStudent(studentId) {
  return db.query1(
    `SELECT s.*, c.name AS class_name, c.level AS class_level
     FROM students s LEFT JOIN classes c ON c.id = s.class_id
     WHERE s.id = ?`,
    [studentId]
  );
}

/* ── helper: running-balance ledger summary ── */
async function getLedgerMeta(studentId) {
  const row = await db.query1(
    `SELECT
       COALESCE(SUM(debit),  0) AS total_charged,
       COALESCE(SUM(credit), 0) AS total_paid,
       COALESCE(SUM(debit) - SUM(credit), 0) AS balance
     FROM fee_ledger WHERE student_id = ?`,
    [studentId]
  );
  return {
    totalCharged: parseFloat(row?.total_charged || 0),
    totalPaid:    parseFloat(row?.total_paid    || 0),
    balance:      parseFloat(row?.balance       || 0),
  };
}

/* ════════════════════════════════════════════════════════════════
   GET /api/student-finance/:studentId/summary
   Returns student profile + ledger meta + unpaid counts in one hit.
════════════════════════════════════════════════════════════════ */
exports.getSummary = async (req, res) => {
  await ensureTables();
  try {
    const { studentId } = req.params;
    if (!canAccess(req.user, studentId))
      return fail(res, 403, 'Access denied.');

    const student = await getStudent(studentId);
    if (!student) return fail(res, 404, 'Student not found.');

    const [ledger, unpaidFees, unpaidLevies, recentActivity] = await Promise.all([
      getLedgerMeta(studentId),

      db.query1(
        `SELECT COUNT(*) AS cnt, COALESCE(SUM(amount),0) AS total
         FROM fee_payments WHERE student_id=? AND status='Unpaid'`,
        [studentId]
      ),

      db.query1(
        `SELECT COUNT(*) AS cnt, COALESCE(SUM(amount_paid),0) AS total
         FROM levy_payments WHERE student_id=? AND status='Unpaid'`,
        [studentId]
      ),

      db.query(
        `SELECT * FROM fee_ledger WHERE student_id=?
         ORDER BY created_at DESC LIMIT 8`,
        [studentId]
      ),
    ]);

    const school = await db.query1(
      `SELECT setting_key, setting_value FROM school_settings
       WHERE setting_key IN ('school_name','current_session','current_term','principal_name')`,
      []
    ).catch(() => null);

    // Fetch all settings at once
    const settings = {};
    const sRows = await db.query(
      `SELECT setting_key, setting_value FROM school_settings
       WHERE setting_key IN ('school_name','current_session','current_term','principal_name','school_address','school_phone')`,
      []
    ).catch(() => []);
    sRows.forEach(r => { settings[r.setting_key] = r.setting_value; });

    return ok(res, {
      student: {
        id:         student.id,
        name:       student.name,
        class:      student.class_name || '',
        arm:        student.arm || '',
        gender:     student.gender,
        attendance: student.attendance,
      },
      ledger: {
        totalCharged: ledger.totalCharged,
        totalPaid:    ledger.totalPaid,
        balance:      ledger.balance,
        status:       ledger.balance <= 0 ? 'Cleared' : 'Outstanding',
        percentPaid:  ledger.totalCharged > 0
          ? Math.round((ledger.totalPaid / ledger.totalCharged) * 100)
          : 100,
      },
      unpaid: {
        feeCount:      Number(unpaidFees?.cnt   || 0),
        feeAmount:     parseFloat(unpaidFees?.total  || 0),
        levyCount:     Number(unpaidLevies?.cnt  || 0),
        levyAmount:    parseFloat(unpaidLevies?.total || 0),
        totalCount:    Number(unpaidFees?.cnt || 0) + Number(unpaidLevies?.cnt || 0),
        totalAmount:   parseFloat(unpaidFees?.total || 0) + parseFloat(unpaidLevies?.total || 0),
      },
      recentActivity,
      school: settings,
    });
  } catch (e) { return fail(res, 500, e.message); }
};

/* ════════════════════════════════════════════════════════════════
   GET /api/student-finance/:studentId/charges
════════════════════════════════════════════════════════════════ */
exports.getCharges = async (req, res) => {
  await ensureTables();
  try {
    const { studentId } = req.params;
    if (!canAccess(req.user, studentId)) return fail(res, 403, 'Access denied.');

    const { term, session, status } = req.query;
    let sql = `SELECT f.*, c.name AS class_name, s.arm AS student_arm
               FROM fee_payments f
               JOIN students s ON s.id = f.student_id
               LEFT JOIN classes c ON c.id = s.class_id
               WHERE f.student_id = ?`;
    const p = [studentId];
    if (term)    { sql += ' AND f.term = ?';    p.push(term); }
    if (session) { sql += ' AND f.session = ?'; p.push(session); }
    if (status)  { sql += ' AND f.status = ?';  p.push(status); }
    sql += ' ORDER BY f.created_at DESC';

    const rows = await db.query(sql, p);
    const meta = {
      count:       rows.length,
      totalAmount: rows.reduce((a, r) => a + parseFloat(r.amount || 0), 0),
      paidAmount:  rows.filter(r => r.status === 'Paid').reduce((a, r) => a + parseFloat(r.amount || 0), 0),
      unpaidCount: rows.filter(r => r.status === 'Unpaid').length,
    };
    return ok(res, rows, meta);
  } catch (e) { return fail(res, 500, e.message); }
};

/* ════════════════════════════════════════════════════════════════
   GET /api/student-finance/:studentId/payments
════════════════════════════════════════════════════════════════ */
exports.getPayments = async (req, res) => {
  await ensureTables();
  try {
    const { studentId } = req.params;
    if (!canAccess(req.user, studentId)) return fail(res, 403, 'Access denied.');

    const { term, session } = req.query;
    let sql = `SELECT f.*, c.name AS class_name
               FROM fee_payments f
               JOIN students s ON s.id = f.student_id
               LEFT JOIN classes c ON c.id = s.class_id
               WHERE f.student_id = ? AND f.status IN ('Paid','Partial','Waived')`;
    const p = [studentId];
    if (term)    { sql += ' AND f.term = ?';    p.push(term); }
    if (session) { sql += ' AND f.session = ?'; p.push(session); }
    sql += ' ORDER BY f.payment_date DESC, f.created_at DESC';

    const rows = await db.query(sql, p);
    const total = rows.reduce((a, r) => a + parseFloat(r.amount || 0), 0);
    return ok(res, rows, { count: rows.length, totalPaid: total });
  } catch (e) { return fail(res, 500, e.message); }
};

/* ════════════════════════════════════════════════════════════════
   GET /api/student-finance/:studentId/levies
════════════════════════════════════════════════════════════════ */
exports.getLevies = async (req, res) => {
  await ensureTables();
  try {
    const { studentId } = req.params;
    if (!canAccess(req.user, studentId)) return fail(res, 403, 'Access denied.');

    const rows = await db.query(
      `SELECT lp.*,
              l.name AS levy_name, l.category, l.due_date,
              l.description AS levy_description, l.amount AS levy_amount
       FROM levy_payments lp
       JOIN levies l ON l.id = lp.levy_id
       WHERE lp.student_id = ?
       ORDER BY lp.created_at DESC`,
      [studentId]
    );
    const unpaid = rows.filter(r => r.status === 'Unpaid');
    return ok(res, rows, {
      count:         rows.length,
      unpaidCount:   unpaid.length,
      unpaidAmount:  unpaid.reduce((a, r) => a + parseFloat(r.amount_paid || 0), 0),
      totalAmount:   rows.reduce((a, r) => a + parseFloat(r.amount_paid   || 0), 0),
    });
  } catch (e) { return fail(res, 500, e.message); }
};

/* ════════════════════════════════════════════════════════════════
   GET /api/student-finance/:studentId/ledger
════════════════════════════════════════════════════════════════ */
exports.getLedger = async (req, res) => {
  await ensureTables();
  try {
    const { studentId } = req.params;
    if (!canAccess(req.user, studentId)) return fail(res, 403, 'Access denied.');

    const { term, session, academic_year } = req.query;
    let sql = 'SELECT * FROM fee_ledger WHERE student_id = ?';
    const p = [studentId];
    if (term)         { sql += ' AND term = ?';          p.push(term); }
    if (session)      { sql += ' AND session = ?';       p.push(session); }
    if (academic_year){ sql += ' AND academic_year = ?'; p.push(academic_year); }
    sql += ' ORDER BY created_at ASC';

    const entries = await db.query(sql, p);
    const meta    = await getLedgerMeta(studentId);

    return ok(res, entries, {
      totalCharged: meta.totalCharged,
      totalPaid:    meta.totalPaid,
      balance:      meta.balance,
      status:       meta.balance <= 0 ? 'Cleared' : 'Outstanding',
    });
  } catch (e) { return fail(res, 500, e.message); }
};

/* ════════════════════════════════════════════════════════════════
   GET /api/student-finance/:studentId/statement
   Full structured statement — all sections in one response.
   Used for printing/PDF generation.
════════════════════════════════════════════════════════════════ */
exports.getStatement = async (req, res) => {
  await ensureTables();
  try {
    const { studentId } = req.params;
    if (!canAccess(req.user, studentId)) return fail(res, 403, 'Access denied.');

    const { term, session } = req.query;

    const student = await getStudent(studentId);
    if (!student) return fail(res, 404, 'Student not found.');

    const feeParams = [studentId];
    let feeFilter = '';
    if (term)    { feeFilter += ' AND term = ?';    feeParams.push(term); }
    if (session) { feeFilter += ' AND session = ?'; feeParams.push(session); }

    const [charges, levies, ledger, settings] = await Promise.all([
      db.query(`SELECT * FROM fee_payments WHERE student_id = ?${feeFilter} ORDER BY payment_date DESC`, feeParams),
      db.query(`SELECT lp.*, l.name AS levy_name, l.category, l.due_date
                FROM levy_payments lp JOIN levies l ON l.id=lp.levy_id
                WHERE lp.student_id = ? ORDER BY lp.created_at DESC`, [studentId]),
      db.query(`SELECT * FROM fee_ledger WHERE student_id = ?${feeFilter} ORDER BY created_at ASC`, feeParams),
      db.query(`SELECT setting_key, setting_value FROM school_settings
                WHERE setting_key IN ('school_name','current_session','current_term',
                'principal_name','school_address','school_phone','school_email')`, []),
    ]);

    const schoolInfo = {};
    settings.forEach(r => { schoolInfo[r.setting_key] = r.setting_value; });
    const ledgerMeta = await getLedgerMeta(studentId);

    // Term breakdown
    const terms = [...new Set(charges.map(c => c.term))];
    const termBreakdown = terms.map(t => {
      const tc = charges.filter(c => c.term === t);
      const paid   = tc.filter(c => c.status === 'Paid').reduce((a,c) => a+parseFloat(c.amount),0);
      const unpaid = tc.filter(c => c.status === 'Unpaid').reduce((a,c) => a+parseFloat(c.amount),0);
      return { term: t, count: tc.length, paid, unpaid, total: paid+unpaid };
    });

    return ok(res, {
      student: {
        id: student.id, name: student.name,
        class: student.class_name || '', arm: student.arm || '',
        gender: student.gender, attendance: student.attendance,
      },
      school:         schoolInfo,
      charges,
      levies,
      ledger,
      ledgerMeta,
      termBreakdown,
      generatedAt:    new Date().toISOString(),
      filterTerm:     term    || null,
      filterSession:  session || null,
    });
  } catch (e) { return fail(res, 500, e.message); }
};

/* ════════════════════════════════════════════════════════════════
   POST /api/student-finance/:studentId/pay
   Record a payment for an EXISTING charge (fee_payment record).
   Body: { chargeId, amountPaid, date, method, reference, note }
════════════════════════════════════════════════════════════════ */
exports.recordPayment = async (req, res) => {
  await ensureTables();
  try {
    const { studentId } = req.params;
    if (req.user.role !== 'Admin' && req.user.role !== 'Teacher' && req.user.role !== 'Bursar')
      return fail(res, 403, 'Only Admin, Teacher or Bursar can record payments.');

    const { chargeId, amountPaid, date, method, reference, note } = req.body ?? {};
    if (!chargeId || !amountPaid || !date)
      return fail(res, 400, 'chargeId, amountPaid, date are required.');

    const charge = await db.query1('SELECT * FROM fee_payments WHERE id=? AND student_id=?', [chargeId, studentId]);
    if (!charge) return fail(res, 404, 'Charge not found for this student.');

    const amt    = parseFloat(amountPaid);
    const status = amt >= parseFloat(charge.amount) ? 'Paid' : 'Partial';

    await db.run(
      `UPDATE fee_payments SET status=?, payment_date=?, reference=?, note=? WHERE id=?`,
      [status, date, reference || charge.reference, note || charge.note, chargeId]
    );

    // Add ledger credit entry
    const lastBal = await db.query1(
      'SELECT balance FROM fee_ledger WHERE student_id=? ORDER BY id DESC LIMIT 1',
      [studentId]
    );
    const prevBalance = lastBal ? parseFloat(lastBal.balance) : 0;
    const newBalance  = prevBalance - amt;

    await db.run(
      `INSERT INTO fee_ledger
       (student_id, payment_id, entry_type, description, debit, credit, balance,
        term, session, class_at_time, reference, created_by)
       VALUES (?,?,?,?,0,?,?,?,?,?,?,?)`,
      [
        studentId, chargeId, 'payment',
        `${charge.fee_type} — payment via ${method || 'Cash'}`,
        amt, newBalance,
        charge.term, charge.session,
        null, reference || null, req.user?.name || null,
      ]
    );

    const updated = await db.query1('SELECT * FROM fee_payments WHERE id=?', [chargeId]);
    const ledgerMeta = await getLedgerMeta(studentId);

    return ok(res, {
      payment:  updated,
      status,
      newBalance: ledgerMeta.balance,
      receiptData: {
        id:           chargeId,
        student_id:   studentId,
        fee_type:     charge.fee_type,
        amount:       amt,
        expected:     parseFloat(charge.amount),
        payment_date: date,
        term:         charge.term,
        session:      charge.session,
        reference:    reference || null,
        method:       method || 'Cash',
        status,
      },
    });
  } catch (e) { return fail(res, 500, e.message); }
};

/* ════════════════════════════════════════════════════════════════
   POST /api/student-finance/:studentId/charge
   Add a direct charge (creates fee_payment + ledger debit).
   Body: { feeType, amount, date, term, session, reference }
════════════════════════════════════════════════════════════════ */
exports.addCharge = async (req, res) => {
  await ensureTables();
  try {
    const { studentId } = req.params;
    if (req.user.role !== 'Admin' && req.user.role !== 'Teacher' && req.user.role !== 'Bursar')
      return fail(res, 403, 'Only Admin, Teacher or Bursar can add charges.');

    const { feeType, amount, date, term, session, reference, note } = req.body ?? {};
    if (!feeType || !amount || !date || !term)
      return fail(res, 400, 'feeType, amount, date, term are required.');

    const student = await getStudent(studentId);
    if (!student) return fail(res, 404, 'Student not found.');

    const id = `FEE${Date.now()}`;
    await db.run(
      `INSERT INTO fee_payments (id, student_id, fee_type, amount, payment_date, term, session, status, reference, note, created_by)
       VALUES (?,?,?,?,?,?,?,'Unpaid',?,?,?)`,
      [id, studentId, feeType, parseFloat(amount), date, term, session||null,
       reference||null, note||null, req.user?.name||null]
    );

    // Add ledger debit
    const lastBal = await db.query1(
      'SELECT balance FROM fee_ledger WHERE student_id=? ORDER BY id DESC LIMIT 1', [studentId]
    );
    const prevBalance = lastBal ? parseFloat(lastBal.balance) : 0;
    const newBalance  = prevBalance + parseFloat(amount);

    await db.run(
      `INSERT INTO fee_ledger
       (student_id, payment_id, entry_type, description, debit, credit, balance,
        term, session, class_at_time, reference, created_by)
       VALUES (?,?,?,?,?,0,?,?,?,?,?,?)`,
      [
        studentId, id, 'charge',
        `${feeType} — ${term}${session ? ' / '+session : ''}`,
        parseFloat(amount), newBalance,
        term, session||null, student.class_name||null,
        reference||null, req.user?.name||null,
      ]
    );

    const saved = await db.query1('SELECT * FROM fee_payments WHERE id=?', [id]);
    return ok(res, saved, { newBalance }, 201);
  } catch (e) { return fail(res, 500, e.message); }
};

/* ════════════════════════════════════════════════════════════════
   POST /api/student-finance/:studentId/adjustment
   Manual ledger adjustment (credit / debit / refund).
   Body: { type: 'credit'|'debit'|'refund', amount, description, term, session, reference }
════════════════════════════════════════════════════════════════ */
exports.addAdjustment = async (req, res) => {
  await ensureTables();
  try {
    const { studentId } = req.params;
    if (req.user.role !== 'Admin')
      return fail(res, 403, 'Only Admin can add ledger adjustments.');

    const { type, amount, description, term, session, reference } = req.body ?? {};
    if (!type || !amount || !description)
      return fail(res, 400, 'type, amount, description are required.');
    if (!['credit','debit','refund'].includes(type))
      return fail(res, 400, 'type must be credit, debit, or refund.');

    const student = await getStudent(studentId);
    if (!student) return fail(res, 404, 'Student not found.');

    const debit  = type === 'debit'  ? parseFloat(amount) : 0;
    const credit = type !== 'debit'  ? parseFloat(amount) : 0;

    const lastBal = await db.query1(
      'SELECT balance FROM fee_ledger WHERE student_id=? ORDER BY id DESC LIMIT 1', [studentId]
    );
    const prevBalance = lastBal ? parseFloat(lastBal.balance) : 0;
    const newBalance  = prevBalance + debit - credit;
    const entryType   = type === 'debit' ? 'adjustment' : type === 'refund' ? 'refund' : 'adjustment';

    await db.run(
      `INSERT INTO fee_ledger
       (student_id, entry_type, description, debit, credit, balance,
        term, session, class_at_time, reference, created_by)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [
        studentId, entryType, description,
        debit, credit, newBalance,
        term||null, session||null, student.class_name||null,
        reference||null, req.user?.name||null,
      ]
    );

    return ok(res, { studentId, entryType, debit, credit, newBalance }, {}, 201);
  } catch (e) { return fail(res, 500, e.message); }
};

/* ════════════════════════════════════════════════════════════════
   GET /api/student-finance/:studentId/receipt/:paymentId
   Returns structured receipt data for one payment.
════════════════════════════════════════════════════════════════ */
exports.getReceipt = async (req, res) => {
  await ensureTables();
  try {
    const { studentId, paymentId } = req.params;
    if (!canAccess(req.user, studentId)) return fail(res, 403, 'Access denied.');

    const [payment, student] = await Promise.all([
      db.query1('SELECT * FROM fee_payments WHERE id=? AND student_id=?', [paymentId, studentId]),
      getStudent(studentId),
    ]);

    if (!payment) return fail(res, 404, 'Payment not found.');

    const settings = {};
    const sRows = await db.query(
      `SELECT setting_key, setting_value FROM school_settings
       WHERE setting_key IN ('school_name','principal_name','school_address','school_phone')`, []
    ).catch(() => []);
    sRows.forEach(r => { settings[r.setting_key] = r.setting_value; });

    const amt      = parseFloat(payment.amount);
    const rcpNo    = 'RCP-' + String(payment.id).replace(/\D/g,'').slice(-6).padStart(6,'0') + '-' + new Date().getFullYear();

    return ok(res, {
      receiptNo:    rcpNo,
      payment:      payment,
      student: {
        id:    student.id, name: student.name,
        class: student.class_name || '', arm: student.arm || '',
      },
      school:       settings,
      amount:       amt,
      status:       payment.status,
      generatedAt:  new Date().toISOString(),
    });
  } catch (e) { return fail(res, 500, e.message); }
};

/* ════════════════════════════════════════════════════════════════
   GET /api/student-finance/:studentId/export
   CSV export of full ledger.
════════════════════════════════════════════════════════════════ */
exports.exportCSV = async (req, res) => {
  await ensureTables();
  try {
    const { studentId } = req.params;
    if (!canAccess(req.user, studentId)) return fail(res, 403, 'Access denied.');

    const student = await getStudent(studentId);
    if (!student) return fail(res, 404, 'Student not found.');

    const entries = await db.query(
      'SELECT * FROM fee_ledger WHERE student_id=? ORDER BY created_at ASC', [studentId]
    );
    const meta = await getLedgerMeta(studentId);

    const headers = ['Date','Type','Description','Term','Session','Debit (₦)','Credit (₦)','Balance (₦)','Reference'];
    const lines = [
      `# Student Finance Statement — ${student.name} (${student.id})`,
      `# Class: ${student.class_name||''} ${student.arm||''} | Generated: ${new Date().toLocaleString('en-NG')}`,
      `# Total Charged: ₦${meta.totalCharged.toLocaleString()} | Total Paid: ₦${meta.totalPaid.toLocaleString()} | Balance: ₦${meta.balance.toLocaleString()}`,
      '',
      headers.join(','),
      ...entries.map(e => [
        new Date(e.created_at).toLocaleDateString('en-NG'),
        e.entry_type,
        `"${(e.description||'').replace(/"/g,'""')}"`,
        e.term || '',
        e.session || '',
        e.debit  || 0,
        e.credit || 0,
        e.balance || 0,
        e.reference || '',
      ].join(',')),
    ];

    res.setHeader('Content-Type',        'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="finance_${student.name.replace(/\s+/g,'_')}_${student.id.replace(/\//g,'-')}.csv"`);
    return res.send('\uFEFF' + lines.join('\n'));
  } catch (e) { return fail(res, 500, e.message); }
};