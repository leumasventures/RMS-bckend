'use strict';

/**
 * feeController.js — Sacred Heart College (SAHARCO)
 *
 * Routes (wired in feeRoutes.js):
 *   GET    /api/fees                       getAll
 *   GET    /api/fees/summary               getSummary
 *   GET    /api/fees/student/:studentId    getByStudent
 *   GET    /api/fees/export/csv            exportCSV
 *   GET    /api/fees/:id                   getOne
 *   POST   /api/fees                       create
 *   PUT    /api/fees/:id                   update
 *   PATCH  /api/fees/:id/status            updateStatus
 *   DELETE /api/fees/:id                   remove
 *   GET    /api/fees/structure             getStructure
 *   POST   /api/fees/structure             addStructureItem
 *   PUT    /api/fees/structure/:id         updateStructureItem
 *   DELETE /api/fees/structure/:id         deleteStructureItem
 *
 * Field names match openFeePaymentModal() and exportFeesCSV() in script3.js,
 * and API.Fees.* method signatures in api.js.
 */

const db = require('../config/db');

/* ─── constants ─────────────────────────────────────────────────────────── */

const DEFAULT_FEE_STRUCTURE = [
  { id: 1, label: 'Tuition Fee',      amount: 45000, level: 'All'    },
  { id: 2, label: 'Development Levy', amount: 10000, level: 'All'    },
  { id: 3, label: 'Exam Fee',         amount: 5000,  level: 'Senior' },
  { id: 4, label: 'PTA Dues',         amount: 3000,  level: 'All'    },
];

// Matches status options in openFeePaymentModal + VALID_STATUSES in api.js
const VALID_STATUSES = ['Paid', 'Partial', 'Unpaid', 'Waived', 'overdue'];
const VALID_LEVELS   = ['All', 'Junior', 'Senior'];

/* ─── helpers ────────────────────────────────────────────────────────────── */

const fail = (res, status, msg, extra = {}) =>
  res.status(status).json({ success: false, message: msg, ...extra });

const ok = (res, data, meta = {}, status = 200) =>
  res.status(status).json({ success: true, ...meta, data });

function ensureStore(key, fallback) {
  if (!db[key]) db[key] = typeof fallback === 'function' ? fallback() : fallback;
  return db[key];
}

function nextFeeId() {
  const fees = db.fees || [];
  const max  = fees.reduce((m, f) => Math.max(m, parseInt((f.id || '0').replace(/\D/g, '')) || 0), 0);
  return `FEE${max + 1}`;
}

function nextStructureId() {
  const s = db.feeStructure || [];
  return s.length ? Math.max(...s.map(f => f.id || 0)) + 1 : 1;
}

/**
 * Enrich a fee record with student name/class/arm.
 * Matches the shape rendered by renderFees() in script3.js.
 */
function enrichFee(f) {
  const s = (db.students || []).find(st => st.id === f.studentId);
  return { ...f, studentName: s?.name || f.studentId, class: s?.class || '', arm: s?.arm || '' };
}

/**
 * Stat cards matching the summary strip at the top of renderFees().
 */
function buildSummary(fees, students) {
  const structure    = ensureStore('feeStructure', () => [...DEFAULT_FEE_STRUCTURE]);
  const totalExpected = students.length * structure.reduce((a, f) => a + (f.amount || 0), 0);
  const totalPaid     = fees.filter(f => f.status === 'Paid').reduce((a, f) => a + (f.amount || 0), 0);
  const totalPartial  = fees.filter(f => f.status === 'Partial').reduce((a, f) => a + (f.amount || 0), 0);
  const totalCollected = totalPaid + totalPartial;
  return {
    studentCount:    students.length,
    totalExpected,
    totalCollected,
    totalPaid,
    totalPartial,
    outstanding:     Math.max(0, totalExpected - totalCollected),
    paymentCount:    fees.length,
    paidCount:       fees.filter(f => f.status === 'Paid').length,
    partialCount:    fees.filter(f => f.status === 'Partial').length,
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
   FEE STRUCTURE
═══════════════════════════════════════════════════════════════════════════ */

exports.getStructure = (req, res) => {
  const structure = ensureStore('feeStructure', () => [...DEFAULT_FEE_STRUCTURE]);
  return ok(res, structure, { total: structure.length });
};

exports.addStructureItem = (req, res) => {
  const { label, amount, level = 'All' } = req.body;
  if (!label || amount === undefined) return fail(res, 400, 'label and amount are required.');

  const amtNum = Number(amount);
  if (isNaN(amtNum) || amtNum < 0) return fail(res, 400, 'amount must be a non-negative number.');
  if (!VALID_LEVELS.includes(level)) return fail(res, 400, `level must be one of: ${VALID_LEVELS.join(', ')}.`);

  const structure = ensureStore('feeStructure', () => [...DEFAULT_FEE_STRUCTURE]);
  const trimLabel = String(label).trim();

  if (structure.some(f => f.label.toLowerCase() === trimLabel.toLowerCase()))
    return fail(res, 409, `Fee type "${trimLabel}" already exists.`);

  const item = { id: nextStructureId(), label: trimLabel, amount: amtNum, level };
  structure.push(item);
  return ok(res, item, {}, 201);
};

exports.updateStructureItem = (req, res) => {
  const structure = ensureStore('feeStructure', () => [...DEFAULT_FEE_STRUCTURE]);
  const idx       = structure.findIndex(f => f.id === Number(req.params.id));
  if (idx < 0) return fail(res, 404, 'Fee structure item not found.');

  const { label, amount, level } = req.body;
  if (amount !== undefined) {
    const n = Number(amount);
    if (isNaN(n) || n < 0) return fail(res, 400, 'amount must be a non-negative number.');
    structure[idx].amount = n;
  }
  if (label) structure[idx].label = String(label).trim();
  if (level) {
    if (!VALID_LEVELS.includes(level)) return fail(res, 400, `level must be one of: ${VALID_LEVELS.join(', ')}.`);
    structure[idx].level = level;
  }
  return ok(res, structure[idx]);
};

exports.deleteStructureItem = (req, res) => {
  const structure = ensureStore('feeStructure', () => [...DEFAULT_FEE_STRUCTURE]);
  const idx       = structure.findIndex(f => f.id === Number(req.params.id));
  if (idx < 0) return fail(res, 404, 'Fee structure item not found.');

  const [removed] = structure.splice(idx, 1);
  return ok(res, removed, { message: `"${removed.label}" removed.` });
};

/* ═══════════════════════════════════════════════════════════════════════════
   GET /api/fees
   Query: studentId, class, arm, term, session, status, feeType, page, limit
═══════════════════════════════════════════════════════════════════════════ */
exports.getAll = (req, res) => {
  const { studentId, class: cls, arm, term, session, status, feeType,
          page = '1', limit = '100' } = req.query;

  const fees     = ensureStore('fees', []);
  const students = db.students || [];

  // Parent — own ward only
  if (req.user.role === 'Parent') {
    const data = fees
      .filter(f => f.studentId === req.user.wardId)
      .map(enrichFee);
    return ok(res, data, { total: data.length });
  }

  let list = [...fees];

  // Teacher — their class/arm students only
  if (req.user.role === 'Teacher') {
    const classStudentIds = new Set(
      students.filter(s => s.class === req.user.assignedClass &&
                           (!req.user.assignedArm || s.arm === req.user.assignedArm))
              .map(s => s.id)
    );
    list = list.filter(f => classStudentIds.has(f.studentId));
  }

  if (studentId) list = list.filter(f => f.studentId === studentId);
  if (term)      list = list.filter(f => f.term      === term);
  if (session)   list = list.filter(f => f.session   === session);
  if (feeType)   list = list.filter(f => f.feeType   === feeType);
  if (status) {
    // Handle api.js status values: 'unpaid'|'partial'|'paid'|'overdue'
    const normStatus = { unpaid: 'Unpaid', partial: 'Partial', paid: 'Paid', overdue: 'overdue' }[status.toLowerCase()] || status;
    list = list.filter(f => f.status === normStatus);
  }

  if (cls || arm) {
    list = list.filter(f => {
      const s = students.find(st => st.id === f.studentId);
      return (!cls || s?.class === cls) && (!arm || s?.arm === arm);
    });
  }

  const total    = list.length;
  const pageNum  = Math.max(1, parseInt(page,  10) || 1);
  const limitNum = Math.min(500, Math.max(1, parseInt(limit, 10) || 100));

  return ok(res, list.slice((pageNum - 1) * limitNum, pageNum * limitNum).map(enrichFee), {
    total, page: pageNum, limit: limitNum,
    totalPages: Math.ceil(total / limitNum),
  });
};

/* ═══════════════════════════════════════════════════════════════════════════
   GET /api/fees/summary
   Query: term, session
   Returns stat cards matching renderFees() header strip.
═══════════════════════════════════════════════════════════════════════════ */
exports.getSummary = (req, res) => {
  if (req.user.role === 'Parent') return fail(res, 403, 'Access denied.');

  const { term, session } = req.query;
  let fees = ensureStore('fees', []);
  if (term)    fees = fees.filter(f => f.term    === term);
  if (session) fees = fees.filter(f => f.session === session);

  return ok(res, buildSummary(fees, db.students || []), { term: term || 'All', session: session || 'All' });
};

/* ═══════════════════════════════════════════════════════════════════════════
   GET /api/fees/student/:studentId
   Query: term, session
   Matches API.Fees.getPayments({ studentId }) in api.js.
═══════════════════════════════════════════════════════════════════════════ */
exports.getByStudent = (req, res) => {
  const { studentId }     = req.params;
  const { term, session } = req.query;

  if (req.user.role === 'Parent' && req.user.wardId !== studentId)
    return fail(res, 403, 'Access denied.');

  const student = db.findStudent(studentId);
  if (!student) return fail(res, 404, `Student "${studentId}" not found.`);

  if (req.user.role === 'Teacher' &&
      !(req.user.assignedClass === student.class && (!req.user.assignedArm || req.user.assignedArm === student.arm)))
    return fail(res, 403, 'Access denied.');

  let records = (db.fees || []).filter(f => f.studentId === studentId);
  if (term)    records = records.filter(f => f.term    === term);
  if (session) records = records.filter(f => f.session === session);

  const structure      = ensureStore('feeStructure', () => [...DEFAULT_FEE_STRUCTURE]);
  const totalDue       = structure.reduce((a, f) => a + f.amount, 0);
  const totalPaid      = records.filter(f => f.status === 'Paid').reduce((a, f) => a + f.amount, 0);
  const totalPartial   = records.filter(f => f.status === 'Partial').reduce((a, f) => a + f.amount, 0);
  const totalCollected = totalPaid + totalPartial;

  return ok(res, {
    student,
    records: records.map(enrichFee),
    summary: {
      totalDue,
      totalCollected,
      outstanding: Math.max(0, totalDue - totalCollected),
      fullyPaid:   totalCollected >= totalDue,
    },
  });
};

/* ═══════════════════════════════════════════════════════════════════════════
   GET /api/fees/:id
═══════════════════════════════════════════════════════════════════════════ */
exports.getOne = (req, res) => {
  const fees = ensureStore('fees', []);
  const fee  = fees.find(f => f.id === req.params.id);
  if (!fee) return fail(res, 404, `Fee record "${req.params.id}" not found.`);
  if (req.user.role === 'Parent' && fee.studentId !== req.user.wardId)
    return fail(res, 403, 'Access denied.');
  return ok(res, enrichFee(fee));
};

/* ═══════════════════════════════════════════════════════════════════════════
   POST /api/fees
   Body: { studentId*, feeType*, amount*, date*, term*, status?, session? }
   Matches fee-form onsubmit in openFeePaymentModal() and
   API.Fees.recordPayment() in api.js.
═══════════════════════════════════════════════════════════════════════════ */
exports.create = (req, res) => {
  const { studentId, feeType, amount, date, term, session,
          status = 'Paid', reference, note } = req.body;

  const missing = ['studentId', 'feeType', 'amount', 'date', 'term']
    .filter(f => req.body[f] === undefined || req.body[f] === '');
  if (missing.length) return fail(res, 400, `Missing required fields: ${missing.join(', ')}.`);

  const amtNum = Number(amount);
  if (isNaN(amtNum) || amtNum <= 0) return fail(res, 400, 'amount must be a positive number.');

  // Normalise status — api.js sends lowercase
  const normStatus = { paid: 'Paid', partial: 'Partial', unpaid: 'Unpaid', waived: 'Waived' }[String(status).toLowerCase()] || status;
  if (!VALID_STATUSES.map(s => s.toLowerCase()).includes(normStatus.toLowerCase()))
    return fail(res, 400, `status must be one of: ${VALID_STATUSES.join(', ')}.`);

  if (!db.findStudent(studentId))
    return fail(res, 404, `Student "${studentId}" not found.`);

  const fees   = ensureStore('fees', []);
  const record = {
    id:         nextFeeId(),
    studentId,
    feeType:    String(feeType).trim(),
    amount:     amtNum,
    date,
    term,
    session:    session || db.schoolInfo?.session || db.schoolInfo?.current_session || '',
    status:     normStatus,
    reference:  reference || '',
    note:       note      || '',
    createdBy:  req.user.name || req.user.id || 'System',
    createdAt:  new Date().toISOString(),
  };

  fees.push(record);
  return ok(res, enrichFee(record), {}, 201);
};

/* ═══════════════════════════════════════════════════════════════════════════
   PUT /api/fees/:id
═══════════════════════════════════════════════════════════════════════════ */
exports.update = (req, res) => {
  const fees = ensureStore('fees', []);
  const idx  = fees.findIndex(f => f.id === req.params.id);
  if (idx < 0) return fail(res, 404, 'Fee record not found.');

  if (req.body.amount !== undefined) {
    const n = Number(req.body.amount);
    if (isNaN(n) || n <= 0) return fail(res, 400, 'amount must be a positive number.');
  }
  if (req.body.status) {
    const norm = { paid:'Paid', partial:'Partial', unpaid:'Unpaid', waived:'Waived' }[String(req.body.status).toLowerCase()] || req.body.status;
    if (!VALID_STATUSES.map(s => s.toLowerCase()).includes(norm.toLowerCase()))
      return fail(res, 400, `status must be one of: ${VALID_STATUSES.join(', ')}.`);
    req.body.status = norm;
  }

  const { id: _id, studentId: _sid, createdBy: _cb, createdAt: _ca, ...updates } = req.body;
  if (updates.amount) updates.amount = Number(updates.amount);

  fees[idx] = { ...fees[idx], ...updates, updatedAt: new Date().toISOString() };
  return ok(res, enrichFee(fees[idx]));
};

/* ═══════════════════════════════════════════════════════════════════════════
   PATCH /api/fees/:id/status
   Matches API.Fees.verifyPayment() (marks as confirmed/paid).
═══════════════════════════════════════════════════════════════════════════ */
exports.updateStatus = (req, res) => {
  const { status } = req.body;
  if (!status) return fail(res, 400, 'status is required.');

  const norm = { paid:'Paid', partial:'Partial', unpaid:'Unpaid', waived:'Waived' }[String(status).toLowerCase()] || status;
  if (!VALID_STATUSES.map(s => s.toLowerCase()).includes(norm.toLowerCase()))
    return fail(res, 400, `status must be one of: ${VALID_STATUSES.join(', ')}.`);

  const fees = ensureStore('fees', []);
  const idx  = fees.findIndex(f => f.id === req.params.id);
  if (idx < 0) return fail(res, 404, 'Fee record not found.');

  fees[idx].status    = norm;
  fees[idx].updatedAt = new Date().toISOString();
  return ok(res, enrichFee(fees[idx]));
};

/* ═══════════════════════════════════════════════════════════════════════════
   DELETE /api/fees/:id
   Matches API.Fees.reversePayment() in api.js.
═══════════════════════════════════════════════════════════════════════════ */
exports.remove = (req, res) => {
  const fees = ensureStore('fees', []);
  const idx  = fees.findIndex(f => f.id === req.params.id);
  if (idx < 0) return fail(res, 404, 'Fee record not found.');

  const [removed] = fees.splice(idx, 1);
  return ok(res, removed, { message: `Fee record "${removed.id}" deleted.` });
};

/* ═══════════════════════════════════════════════════════════════════════════
   GET /api/fees/export/csv
   Column order matches exportFeesCSV() in api-bridge.js exactly.
═══════════════════════════════════════════════════════════════════════════ */
exports.exportCSV = (req, res) => {
  if (req.user.role === 'Parent') return fail(res, 403, 'Access denied.');

  const { term, session } = req.query;
  let fees = ensureStore('fees', []);
  if (term)    fees = fees.filter(f => f.term    === term);
  if (session) fees = fees.filter(f => f.session === session);

  const students = db.students || [];
  const rows     = [['Student', 'Class', 'Arm', 'Fee Type', 'Amount', 'Date', 'Term', 'Session', 'Status']];

  fees.forEach(f => {
    const s = students.find(st => st.id === f.studentId);
    rows.push([
      s?.name || f.studentId,
      s?.class || '', s?.arm || '',
      f.feeType, f.amount, f.date,
      f.term, f.session || '', f.status,
    ]);
  });

  const csv = rows
    .map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\r\n');

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition',
    `attachment; filename="fees_${term || 'all'}_${Date.now()}.csv"`);
  return res.send('\uFEFF' + csv);
};