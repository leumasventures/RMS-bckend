'use strict';
/**
 * studentFinance.js — uses query param ?sid= to avoid Express
 * decoding %2F in path params (SHC/001 problem).
 */
const express  = require('express');
const sfc      = require('../controllers/studentFinanceController');
const { authenticate, authorize } = require('../middleware/auth');

const router        = express.Router();
const adminBursar   = authorize('Admin', 'Bursar');
const adminOnly     = authorize('Admin');
const anyAllowed    = authorize('Admin', 'Bursar', 'Teacher', 'Staff', 'Parent');

router.options('*', (_req, res) => res.sendStatus(204));

/* ── Public parent portal routes — verified by student ID + phone ───────
   No auth token needed. Parent provides ?sid=SHC/001&phone=08012345678
   Phone is verified against students.phone / parent_phone.
   Only summary, charges, levies, attendance, results exposed.
─────────────────────────────────────────────────────────────────────────── */
async function parentPhoneAuth(req, res, next) {
  const db       = require('../config/db');
  const { sid, phone } = req.query;
  if (!sid || !phone) return res.status(400).json({ success: false, message: 'sid and phone required.' });

  const student = db.findStudent(sid);
  if (!student) return res.status(404).json({ success: false, message: 'Student not found.' });

  const stored  = (student.phone || student.parent_phone || '').replace(/\s/g,'').replace(/^(\+234|234)/, '0');
  const entered = phone.replace(/\s/g,'').replace(/^(\+234|234)/, '0');

  if (!stored || entered.slice(-8) !== stored.slice(-8)) {
    return res.status(403).json({ success: false, message: 'Phone number does not match.' });
  }

  req.params.studentId = sid;
  req.user = { role: 'Parent', ward_id: sid, wardId: sid, name: student.name };
  next();
}

router.get('/pp/summary',  parentPhoneAuth, sfc.getSummary);
router.get('/pp/charges',  parentPhoneAuth, sfc.getCharges);
router.get('/pp/levies',   parentPhoneAuth, sfc.getLevies);
router.get('/pp/payments', parentPhoneAuth, sfc.getPayments);
router.get('/pp/ledger',   parentPhoneAuth, sfc.getLedger);

router.use(authenticate);

/* ── Inject studentId from query param ─────────────────────────── */
function sid(req, res, next) {
  const id = req.query.sid || req.query.studentId;
  if (!id) return res.status(400).json({ success: false, message: 'sid (studentId) query param is required.' });
  req.params.studentId = id;
  next();
}

/* ── Parent ward isolation ──────────────────────────────────────
   Parents may only access their own ward's data.
   All other roles (Admin, Bursar, Teacher, Staff) can access any student.
─────────────────────────────────────────────────────────────────── */
function guardParentAccess(req, res, next) {
  const user = req.user;
  if (!user) return res.status(401).json({ success: false, message: 'Not authenticated.' });

  if (user.role === 'Parent') {
    const wardId = user.ward_id || user.wardId;
    const requestedId = req.params.studentId;
    if (!wardId) {
      return res.status(403).json({ success: false, message: 'No ward linked to your account. Contact the administrator.' });
    }
    if (String(wardId) !== String(requestedId)) {
      return res.status(403).json({ success: false, message: 'Access denied. You can only view your own ward\'s financial records.' });
    }
  }
  next();
}

/* ── READ endpoints ─────────────────────────────────────────────
   Admin, Bursar, Teacher, Staff: any student
   Parent: own ward only (enforced by guardParentAccess)
─────────────────────────────────────────────────────────────────── */
router.get('/summary',            anyAllowed, sid, guardParentAccess, sfc.getSummary);
router.get('/charges',            anyAllowed, sid, guardParentAccess, sfc.getCharges);
router.get('/payments',           anyAllowed, sid, guardParentAccess, sfc.getPayments);
router.get('/levies',             anyAllowed, sid, guardParentAccess, sfc.getLevies);
router.get('/ledger',             anyAllowed, sid, guardParentAccess, sfc.getLedger);
router.get('/statement',          anyAllowed, sid, guardParentAccess, sfc.getStatement);
router.get('/export',             anyAllowed, sid, guardParentAccess, sfc.exportCSV);
router.get('/receipt/:paymentId', anyAllowed, sid, guardParentAccess, sfc.getReceipt);

/* ── WRITE endpoints ────────────────────────────────────────────
   Only Admin + Bursar can write. Parents and Teachers cannot.
─────────────────────────────────────────────────────────────────── */
router.post('/pay',        adminBursar, sid, sfc.recordPayment);
router.post('/charge',     adminBursar, sid, sfc.addCharge);
router.post('/adjustment', adminOnly,   sid, sfc.addAdjustment);

module.exports = router;