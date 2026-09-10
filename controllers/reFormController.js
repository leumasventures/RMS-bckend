'use strict';

/**
 * reFormController.js — Sacred Heart College (SAHARCO)
 *
 * Routes (wired in reFormRoutes.js):
 *   GET    /api/reforms               getAll
 *   GET    /api/reforms/stats         getStats       ← new
 *   GET    /api/reforms/:id           getOne
 *   GET    /api/reforms/student/:sid  getByStudent
 *   POST   /api/reforms               create
 *   PUT    /api/reforms/:id           update
 *   PATCH  /api/reforms/:id/approve   approve
 *   PATCH  /api/reforms/:id/reject    reject
 *   DELETE /api/reforms/:id           remove
 *
 * Changes from document-11 original:
 *  1. getStats endpoint added — counts by type and status.
 *  2. ensureStore() guards every db.reForms access so the controller
 *     doesn't crash if db.reForms is undefined at startup.
 *  3. generateRefNo() is now collision-safe (checks existing refNos).
 *  4. create validates arm membership inside fromClass and toClass.
 *  5. approve cascades correctly: TransferOut sets student.active = false
 *     and student.status = 'transferred' (document-11 left it active).
 *  6. update also validates toClass arm and fromClass arm when changed.
 *  7. All responses use unified { success, data, message } shape.
 *  8. Pagination (page + limit) added to getAll.
 *  9. getByStudent includes both Pending and historical forms.
 * 10. req.user?.id used defensively (document-11 crashed on undefined).
 */

const db = require('../config/db');

/* ─── constants ─────────────────────────────────────────────────────────── */

const VALID_TYPES    = ['ReRegistration', 'Promotion', 'Demotion', 'TransferOut', 'TransferIn'];
const VALID_STATUSES = ['Pending', 'Approved', 'Rejected'];

/* ─── helpers ────────────────────────────────────────────────────────────── */

const fail = (res, status, msg, extra = {}) =>
  res.status(status).json({ success: false, message: msg, ...extra });

const ok = (res, data, meta = {}, status = 200) =>
  res.status(status).json({ success: true, ...meta, data });

function ensureStore() {
  if (!db.reForms) db.reForms = [];
  return db.reForms;
}

/**
 * Collision-safe reference number.
 * Checks the full existing set of refNos before incrementing.
 */
function generateRefNo(type, session) {
  const year   = (session || '2025/2026').split('/')[1] || '2026';
  const prefix = { ReRegistration:'REG', Promotion:'PRO', Demotion:'DEM', TransferOut:'TRO', TransferIn:'TRI' }[type] || 'REF';
  const forms  = ensureStore();
  const existing = new Set(forms.map(f => f.refNo));
  let n = forms.length + 1, refNo;
  do { refNo = `${prefix}/${year}/${String(n).padStart(3, '0')}`; n++; } while (existing.has(refNo));
  return refNo;
}

/**
 * Validate that `arm` exists inside `className`.
 * Returns an error string or null.
 */
function validateArmInClass(className, arm, fieldName) {
  if (!arm) return null;
  const cls = db.findClass(className);
  if (!cls) return `${fieldName} class "${className}" does not exist.`;
  if (cls.arms && !cls.arms.includes(arm))
    return `${fieldName} arm "${arm}" does not exist in "${className}". Valid arms: ${cls.arms.join(', ')}.`;
  return null;
}

/* ═══════════════════════════════════════════════════════════════════════════
   GET /api/reforms
   Query: type, status, studentId, session, term, page, limit
═══════════════════════════════════════════════════════════════════════════ */
exports.getAll = (req, res) => {
  const { type, status, studentId, session, term, page = '1', limit = '50' } = req.query;

  let list = [...ensureStore()];
  if (type)      list = list.filter(r => r.type      === type);
  if (status)    list = list.filter(r => r.status    === status);
  if (studentId) list = list.filter(r => r.studentId === studentId);
  if (session)   list = list.filter(r => r.toSession === session || r.fromSession === session);
  if (term)      list = list.filter(r => r.term      === term);

  const total    = list.length;
  const pageNum  = Math.max(1, parseInt(page,  10) || 1);
  const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));

  return res.json({
    success: true,
    data:       list.slice((pageNum - 1) * limitNum, pageNum * limitNum),
    total,
    page:       pageNum,
    limit:      limitNum,
    totalPages: Math.ceil(total / limitNum),
  });
};

/* ═══════════════════════════════════════════════════════════════════════════
   GET /api/reforms/stats
   Query: session
═══════════════════════════════════════════════════════════════════════════ */
exports.getStats = (req, res) => {
  const { session } = req.query;
  let list = ensureStore();
  if (session) list = list.filter(r => r.toSession === session || r.fromSession === session);

  const byStatus = Object.fromEntries(VALID_STATUSES.map(s => [s, 0]));
  const byType   = Object.fromEntries(VALID_TYPES.map(t => [t, 0]));
  list.forEach(r => {
    if (byStatus[r.status] !== undefined) byStatus[r.status]++;
    if (byType[r.type]     !== undefined) byType[r.type]++;
  });

  return ok(res, { total: list.length, byStatus, byType });
};

/* ═══════════════════════════════════════════════════════════════════════════
   GET /api/reforms/:id
═══════════════════════════════════════════════════════════════════════════ */
exports.getOne = (req, res) => {
  const form = ensureStore().find(r => r.id === Number(req.params.id));
  if (!form) return fail(res, 404, `Re-form ${req.params.id} not found.`);
  return ok(res, { ...form, student: db.findStudent(form.studentId) || null });
};

/* ═══════════════════════════════════════════════════════════════════════════
   GET /api/reforms/student/:studentId
═══════════════════════════════════════════════════════════════════════════ */
exports.getByStudent = (req, res) => {
  const student = db.findStudent(req.params.studentId);
  if (!student) return fail(res, 404, `Student "${req.params.studentId}" not found.`);

  const data = ensureStore().filter(r => r.studentId === req.params.studentId);
  return ok(res, data, { total: data.length, student });
};

/* ═══════════════════════════════════════════════════════════════════════════
   POST /api/reforms
   Body: { studentId, type, fromClass, fromArm, toClass, toArm,
           fromSession, toSession, term, notes? }
═══════════════════════════════════════════════════════════════════════════ */
exports.create = (req, res) => {
  const { studentId, type, fromClass, fromArm, toClass, toArm,
          fromSession, toSession, term, notes } = req.body;

  const missing = ['studentId','type','fromClass','fromArm','toClass','toArm','fromSession','toSession','term']
    .filter(f => !req.body[f]);
  if (missing.length) return fail(res, 400, `Missing required fields: ${missing.join(', ')}.`);

  if (!VALID_TYPES.includes(type))
    return fail(res, 400, `type must be one of: ${VALID_TYPES.join(', ')}.`);

  if (!db.findStudent(studentId))
    return fail(res, 404, `Student "${studentId}" not found.`);

  // Validate fromClass/fromArm
  if (!db.findClass(fromClass)) return fail(res, 400, `fromClass "${fromClass}" does not exist.`);
  const fromArmErr = validateArmInClass(fromClass, fromArm, 'fromArm');
  if (fromArmErr) return fail(res, 400, fromArmErr);

  // Validate toClass/toArm
  if (!db.findClass(toClass)) return fail(res, 400, `toClass "${toClass}" does not exist.`);
  const toArmErr = validateArmInClass(toClass, toArm, 'toArm');
  if (toArmErr) return fail(res, 400, toArmErr);

  const forms = ensureStore();
  const form  = {
    id:          db.nextId ? db.nextId() : Date.now(),
    refNo:       generateRefNo(type, toSession),
    studentId,
    type,
    fromClass, fromArm,
    toClass, toArm,
    fromSession, toSession,
    term,
    status:      'Pending',
    initiatedBy: req.user?.id || req.user?.name || 'System',
    approvedBy:  null,
    initiatedAt: new Date().toISOString().slice(0, 10),
    approvedAt:  null,
    notes:       notes || '',
  };

  forms.push(form);
  return ok(res, form, {}, 201);
};

/* ═══════════════════════════════════════════════════════════════════════════
   PATCH /api/reforms/:id/approve
   Applies class/arm change; marks TransferOut students inactive.
═══════════════════════════════════════════════════════════════════════════ */
exports.approve = (req, res) => {
  const forms = ensureStore();
  const idx   = forms.findIndex(r => r.id === Number(req.params.id));
  if (idx < 0) return fail(res, 404, 'Re-form not found.');

  const form = forms[idx];
  if (form.status !== 'Pending')
    return fail(res, 400, `Form is already "${form.status}". Only Pending forms can be approved.`);

  forms[idx] = {
    ...form,
    status:     'Approved',
    approvedBy: req.user?.id || req.user?.name || 'System',
    approvedAt: new Date().toISOString().slice(0, 10),
    notes:      req.body.notes !== undefined ? req.body.notes : form.notes,
  };

  const student = db.findStudent(form.studentId);
  let message   = `Form ${form.refNo} approved.`;

  if (student) {
    if (form.type === 'TransferOut') {
      // Mark as transferred — student leaves the school
      student.active = false;
      student.status = 'transferred';
      message += ' Student marked as transferred out.';
    } else {
      const prev    = `${student.class} ${student.arm}`;
      student.class = form.toClass;
      student.arm   = form.toArm;
      message += ` Student moved from ${prev} → ${form.toClass} ${form.toArm}.`;
    }
  }

  return ok(res, forms[idx], { message, student: student || null });
};

/* ═══════════════════════════════════════════════════════════════════════════
   PATCH /api/reforms/:id/reject
   Body: { notes? }
═══════════════════════════════════════════════════════════════════════════ */
exports.reject = (req, res) => {
  const forms = ensureStore();
  const idx   = forms.findIndex(r => r.id === Number(req.params.id));
  if (idx < 0) return fail(res, 404, 'Re-form not found.');
  if (forms[idx].status !== 'Pending') return fail(res, 400, 'Only Pending forms can be rejected.');

  forms[idx].status = 'Rejected';
  if (req.body.notes !== undefined) forms[idx].notes = req.body.notes;
  return ok(res, forms[idx]);
};

/* ═══════════════════════════════════════════════════════════════════════════
   PUT /api/reforms/:id
   Update a Pending form (Admin only).
   Now also validates arm membership for toClass and fromClass changes.
═══════════════════════════════════════════════════════════════════════════ */
exports.update = (req, res) => {
  const forms = ensureStore();
  const idx   = forms.findIndex(r => r.id === Number(req.params.id));
  if (idx < 0) return fail(res, 404, 'Re-form not found.');
  if (forms[idx].status !== 'Pending') return fail(res, 400, 'Only Pending forms can be edited.');

  if (req.body.type && !VALID_TYPES.includes(req.body.type))
    return fail(res, 400, `type must be one of: ${VALID_TYPES.join(', ')}.`);

  if (req.body.toClass) {
    if (!db.findClass(req.body.toClass))
      return fail(res, 400, `toClass "${req.body.toClass}" does not exist.`);
    const armErr = validateArmInClass(req.body.toClass, req.body.toArm || forms[idx].toArm, 'toArm');
    if (armErr) return fail(res, 400, armErr);
  }

  if (req.body.fromClass) {
    if (!db.findClass(req.body.fromClass))
      return fail(res, 400, `fromClass "${req.body.fromClass}" does not exist.`);
    const armErr = validateArmInClass(req.body.fromClass, req.body.fromArm || forms[idx].fromArm, 'fromArm');
    if (armErr) return fail(res, 400, armErr);
  }

  // Strip immutable fields
  const { id: _id, refNo: _ref, status: _status, initiatedBy: _by, initiatedAt: _at, ...updates } = req.body;
  forms[idx] = { ...forms[idx], ...updates };
  return ok(res, forms[idx]);
};

/* ═══════════════════════════════════════════════════════════════════════════
   DELETE /api/reforms/:id
   Cannot delete Approved forms.
═══════════════════════════════════════════════════════════════════════════ */
exports.remove = (req, res) => {
  const forms = ensureStore();
  const idx   = forms.findIndex(r => r.id === Number(req.params.id));
  if (idx < 0) return fail(res, 404, 'Re-form not found.');
  if (forms[idx].status === 'Approved')
    return fail(res, 400, 'Approved forms cannot be deleted. Reject first if needed.');

  const [removed] = forms.splice(idx, 1);
  return ok(res, removed, { message: `Form ${removed.refNo} deleted.` });
};