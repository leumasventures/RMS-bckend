'use strict';

const db = require('../config/db');

/* ══════════════════════════════════════════════════════════════════════════════
   CONSTANTS  —  mirrors feeStructure defaults from script3.js
══════════════════════════════════════════════════════════════════════════════ */
const DEFAULT_FEE_STRUCTURE = [
  { id: 1, label: 'Tuition Fee',      amount: 45000, level: 'All'    },
  { id: 2, label: 'Development Levy', amount: 10000, level: 'All'    },
  { id: 3, label: 'Exam Fee',         amount: 5000,  level: 'Senior' },
  { id: 4, label: 'PTA Dues',         amount: 3000,  level: 'All'    },
];

const VALID_STATUSES = ['Paid', 'Partial', 'Unpaid', 'Waived'];
const VALID_LEVELS   = ['All', 'Junior', 'Senior'];

/* ══════════════════════════════════════════════════════════════════════════════
   HELPERS
══════════════════════════════════════════════════════════════════════════════ */
function ensureStore(key, fallback) {
  if (!db[key]) db[key] = typeof fallback === 'function' ? fallback() : fallback;
  return db[key];
}

function nextFeeId() {
  const fees = db.fees || [];
  return fees.length
    ? 'FEE' + (Math.max(...fees.map(f => parseInt((f.id || '0').replace(/\D/g, '')) || 0)) + 1)
    : 'FEE1';
}

function nextStructureId() {
  const s = db.feeStructure || [];
  return s.length ? Math.max(...s.map(f => f.id || 0)) + 1 : 1;
}

/* Compute summary stats — mirrors renderFees() stat cards */
function buildSummary(fees, students, feeStructure) {
  const totalExpected  = students.length * feeStructure.reduce((a, f) => a + (f.amount || 0), 0);
  const totalPaid      = fees.filter(f => f.status === 'Paid').reduce((a, f) => a + (f.amount || 0), 0);
  const totalPartial   = fees.filter(f => f.status === 'Partial').reduce((a, f) => a + (f.amount || 0), 0);
  const totalCollected = totalPaid + totalPartial;
  return {
    studentCount:    students.length,
    totalExpected,
    totalCollected,
    totalPaid,
    totalPartial,
    outstanding:     totalExpected - totalCollected,
    paymentCount:    fees.length,
    paidCount:       fees.filter(f => f.status === 'Paid').length,
    partialCount:    fees.filter(f => f.status === 'Partial').length,
  };
}

/* ══════════════════════════════════════════════════════════════════════════════
   FEE STRUCTURE ENDPOINTS
══════════════════════════════════════════════════════════════════════════════ */

/* GET /api/fees/structure
   Any authenticated user — frontend reads this for the fee-type dropdown.
─────────────────────────────────────────────────────────────────────────── */
exports.getStructure = (req, res) => {
  const structure = ensureStore('feeStructure', () => [...DEFAULT_FEE_STRUCTURE]);
  return res.json({ success: true, data: structure, total: structure.length });
};

/* POST /api/fees/structure  —  Admin only
   Body: { label*, amount*, level? }
─────────────────────────────────────────────────────────────────────────── */
exports.addStructureItem = (req, res) => {
  const { label, amount, level = 'All' } = req.body;

  if (!label || amount === undefined)
    return res.status(400).json({ success: false, message: 'label and amount are required.' });

  const amtNum = Number(amount);
  if (isNaN(amtNum) || amtNum < 0)
    return res.status(400).json({ success: false, message: 'amount must be a non-negative number.' });

  if (!VALID_LEVELS.includes(level))
    return res.status(400).json({ success: false, message: `level must be one of: ${VALID_LEVELS.join(', ')}.` });

  const structure = ensureStore('feeStructure', () => [...DEFAULT_FEE_STRUCTURE]);

  if (structure.some(f => f.label.toLowerCase() === String(label).trim().toLowerCase()))
    return res.status(409).json({ success: false, message: `Fee type "${label}" already exists.` });

  const item = { id: nextStructureId(), label: String(label).trim(), amount: amtNum, level };
  structure.push(item);
  return res.status(201).json({ success: true, data: item });
};

/* PUT /api/fees/structure/:id  —  Admin only */
exports.updateStructureItem = (req, res) => {
  const structure = ensureStore('feeStructure', () => [...DEFAULT_FEE_STRUCTURE]);
  const idx = structure.findIndex(f => f.id === Number(req.params.id));
  if (idx < 0)
    return res.status(404).json({ success: false, message: 'Fee structure item not found.' });

  const { label, amount, level } = req.body;

  if (amount !== undefined) {
    const n = Number(amount);
    if (isNaN(n) || n < 0)
      return res.status(400).json({ success: false, message: 'amount must be a non-negative number.' });
    structure[idx].amount = n;
  }
  if (label) structure[idx].label = String(label).trim();
  if (level) {
    if (!VALID_LEVELS.includes(level))
      return res.status(400).json({ success: false, message: `level must be one of: ${VALID_LEVELS.join(', ')}.` });
    structure[idx].level = level;
  }

  return res.json({ success: true, data: structure[idx] });
};

/* DELETE /api/fees/structure/:id  —  Admin only */
exports.deleteStructureItem = (req, res) => {
  const structure = ensureStore('feeStructure', () => [...DEFAULT_FEE_STRUCTURE]);
  const idx = structure.findIndex(f => f.id === Number(req.params.id));
  if (idx < 0)
    return res.status(404).json({ success: false, message: 'Fee structure item not found.' });

  const [removed] = structure.splice(idx, 1);
  return res.json({ success: true, message: `"${removed.label}" removed.`, data: removed });
};

/* ══════════════════════════════════════════════════════════════════════════════
   PAYMENT RECORD ENDPOINTS
══════════════════════════════════════════════════════════════════════════════ */

/* GET /api/fees
   Query: studentId, class, arm, term, session, status, feeType
   Parent → own ward. Teacher → their class/arm students only (read-only).
─────────────────────────────────────────────────────────────────────────── */
exports.getAll = (req, res) => {
  const { studentId, class: cls, arm, term, session, status, feeType } = req.query;
  const fees     = ensureStore('fees', []);
  const students = db.students || [];

  if (req.user.role === 'Parent') {
    const data = fees
      .filter(f => f.studentId === req.user.wardId)
      .map(f => ({ ...f, studentName: students.find(s => s.id === f.studentId)?.name }));
    return res.json({ success: true, data, total: data.length });
  }

  let list = [...fees];

  if (req.user.role === 'Teacher') {
    const classIds = students
      .filter(s => s.class === req.user.assignedClass && s.arm === req.user.assignedArm)
      .map(s => s.id);
    list = list.filter(f => classIds.includes(f.studentId));
  }

  if (studentId) list = list.filter(f => f.studentId === studentId);
  if (term)      list = list.filter(f => f.term      === term);
  if (session)   list = list.filter(f => f.session   === session);
  if (status)    list = list.filter(f => f.status    === status);
  if (feeType)   list = list.filter(f => f.feeType   === feeType);

  if (cls || arm) {
    list = list.filter(f => {
      const s = students.find(st => st.id === f.studentId);
      return (!cls || s?.class === cls) && (!arm || s?.arm === arm);
    });
  }

  const data = list.map(f => {
    const s = students.find(st => st.id === f.studentId);
    return { ...f, studentName: s?.name || f.studentId, class: s?.class || '', arm: s?.arm || '' };
  });

  return res.json({ success: true, data, total: data.length });
};

/* GET /api/fees/summary?term=&session=
   Stat cards shown at the top of renderFees().
─────────────────────────────────────────────────────────────────────────── */
exports.getSummary = (req, res) => {
  if (req.user.role === 'Parent')
    return res.status(403).json({ success: false, message: 'Access denied.' });

  const { term, session } = req.query;
  let fees = ensureStore('fees', []);
  if (term)    fees = fees.filter(f => f.term    === term);
  if (session) fees = fees.filter(f => f.session === session);

  const feeStructure = ensureStore('feeStructure', () => [...DEFAULT_FEE_STRUCTURE]);
  return res.json({
    success: true,
    data:    buildSummary(fees, db.students || [], feeStructure),
    term:    term    || 'All',
    session: session || 'All',
  });
};

/* GET /api/fees/student/:studentId?term=&session=
   Per-student breakdown with outstanding calculation.
   Accessible to Admin, assigned Teacher, and the student's Parent.
─────────────────────────────────────────────────────────────────────────── */
exports.getByStudent = (req, res) => {
  const { studentId } = req.params;
  const { term, session } = req.query;

  if (req.user.role === 'Parent' && req.user.wardId !== studentId)
    return res.status(403).json({ success: false, message: 'Access denied.' });

  const student = db.findStudent(studentId);
  if (!student)
    return res.status(404).json({ success: false, message: `Student "${studentId}" not found.` });

  if (req.user.role === 'Teacher' &&
      !(req.user.assignedClass === student.class && req.user.assignedArm === student.arm))
    return res.status(403).json({ success: false, message: 'Access denied.' });

  let records = (db.fees || []).filter(f => f.studentId === studentId);
  if (term)    records = records.filter(f => f.term    === term);
  if (session) records = records.filter(f => f.session === session);

  const feeStructure   = ensureStore('feeStructure', () => [...DEFAULT_FEE_STRUCTURE]);
  const totalDue       = feeStructure.reduce((a, f) => a + f.amount, 0);
  const totalPaid      = records.filter(f => f.status === 'Paid').reduce((a, f) => a + f.amount, 0);
  const totalPartial   = records.filter(f => f.status === 'Partial').reduce((a, f) => a + f.amount, 0);
  const totalCollected = totalPaid + totalPartial;

  return res.json({
    success: true,
    data: {
      student,
      records,
      summary: {
        totalDue,
        totalCollected,
        outstanding: Math.max(0, totalDue - totalCollected),
        fullyPaid:   totalCollected >= totalDue,
      },
    },
  });
};

/* GET /api/fees/:id */
exports.getOne = (req, res) => {
  const fee = (ensureStore('fees', [])).find(f => f.id === req.params.id);
  if (!fee)
    return res.status(404).json({ success: false, message: `Fee record "${req.params.id}" not found.` });

  if (req.user.role === 'Parent' && fee.studentId !== req.user.wardId)
    return res.status(403).json({ success: false, message: 'Access denied.' });

  const s = (db.students || []).find(st => st.id === fee.studentId);
  return res.json({ success: true, data: { ...fee, studentName: s?.name, class: s?.class, arm: s?.arm } });
};

/* POST /api/fees  —  Admin only
   Body: { studentId*, feeType*, amount*, date*, term*, status?, session? }
   Mirrors fee-form onsubmit in openFeePaymentModal().
─────────────────────────────────────────────────────────────────────────── */
exports.create = (req, res) => {
  const { studentId, feeType, amount, date, term, session, status = 'Paid' } = req.body;

  const missing = ['studentId', 'feeType', 'amount', 'date', 'term']
    .filter(f => req.body[f] === undefined || req.body[f] === '');
  if (missing.length)
    return res.status(400).json({ success: false, message: `Missing required fields: ${missing.join(', ')}.` });

  const amtNum = Number(amount);
  if (isNaN(amtNum) || amtNum <= 0)
    return res.status(400).json({ success: false, message: 'amount must be a positive number.' });

  if (!VALID_STATUSES.includes(status))
    return res.status(400).json({ success: false, message: `status must be one of: ${VALID_STATUSES.join(', ')}.` });

  if (!db.findStudent(studentId))
    return res.status(404).json({ success: false, message: `Student "${studentId}" not found.` });

  const fees   = ensureStore('fees', []);
  const record = {
    id:        nextFeeId(),
    studentId,
    feeType:   String(feeType).trim(),
    amount:    amtNum,
    date,
    term,
    session:   session || db.schoolInfo?.session || '',
    status,
    createdBy: req.user.name || req.user.id || 'System',
    createdAt: new Date().toISOString(),
  };

  fees.push(record);
  return res.status(201).json({ success: true, data: record });
};

/* PUT /api/fees/:id  —  Admin only */
exports.update = (req, res) => {
  const fees = ensureStore('fees', []);
  const idx  = fees.findIndex(f => f.id === req.params.id);
  if (idx < 0)
    return res.status(404).json({ success: false, message: 'Fee record not found.' });

  if (req.body.amount !== undefined) {
    const n = Number(req.body.amount);
    if (isNaN(n) || n <= 0)
      return res.status(400).json({ success: false, message: 'amount must be a positive number.' });
  }
  if (req.body.status && !VALID_STATUSES.includes(req.body.status))
    return res.status(400).json({ success: false, message: `status must be one of: ${VALID_STATUSES.join(', ')}.` });

  const { id: _id, studentId: _sid, createdBy: _cb, createdAt: _ca, ...updates } = req.body;
  if (updates.amount) updates.amount = Number(updates.amount);

  fees[idx] = { ...fees[idx], ...updates, updatedAt: new Date().toISOString() };
  return res.json({ success: true, data: fees[idx] });
};

/* PATCH /api/fees/:id/status  —  Admin only */
exports.updateStatus = (req, res) => {
  const { status } = req.body;
  if (!status || !VALID_STATUSES.includes(status))
    return res.status(400).json({ success: false, message: `status must be one of: ${VALID_STATUSES.join(', ')}.` });

  const fees = ensureStore('fees', []);
  const idx  = fees.findIndex(f => f.id === req.params.id);
  if (idx < 0)
    return res.status(404).json({ success: false, message: 'Fee record not found.' });

  fees[idx].status    = status;
  fees[idx].updatedAt = new Date().toISOString();
  return res.json({ success: true, data: fees[idx] });
};

/* DELETE /api/fees/:id  —  Admin only */
exports.remove = (req, res) => {
  const fees = ensureStore('fees', []);
  const idx  = fees.findIndex(f => f.id === req.params.id);
  if (idx < 0)
    return res.status(404).json({ success: false, message: 'Fee record not found.' });

  const [removed] = fees.splice(idx, 1);
  return res.json({ success: true, message: `Fee record "${removed.id}" deleted.`, data: removed });
};

/* GET /api/fees/export/csv?term=&session=
   Streams CSV — mirrors exportFeesCSV() column order exactly.
─────────────────────────────────────────────────────────────────────────── */
exports.exportCSV = (req, res) => {
  if (req.user.role === 'Parent')
    return res.status(403).json({ success: false, message: 'Access denied.' });

  const { term, session } = req.query;
  let fees = ensureStore('fees', []);
  if (term)    fees = fees.filter(f => f.term    === term);
  if (session) fees = fees.filter(f => f.session === session);

  const students = db.students || [];
  const rows     = [['Student', 'Class', 'Arm', 'Fee Type', 'Amount', 'Date', 'Term', 'Session', 'Status']];

  fees.forEach(f => {
    const s = students.find(st => st.id === f.studentId);
    rows.push([s?.name || f.studentId, s?.class || '', s?.arm || '', f.feeType, f.amount, f.date, f.term, f.session || '', f.status]);
  });

  const csv = rows.map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="fees_${term || 'all'}_${Date.now()}.csv"`);
  return res.send('\uFEFF' + csv);
};