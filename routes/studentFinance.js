'use strict';
/**
 * studentFinance.js — uses query param ?sid= to avoid Express
 * decoding %2F in path params (SHC/001 problem).
 *
 * All endpoints: /api/student-finance/:action?sid=SHC%2F001
 */
const express  = require('express');
const sfc      = require('../controllers/studentsFinanceController');
const { authenticate, authorize } = require('../middleware/auth');

const router             = express.Router();
const adminTeacherBursar = authorize('Admin', 'Teacher', 'Bursar');

router.use(authenticate);

// Inject studentId from query param into req.params
function sid(req, res, next) {
  const id = req.query.sid || req.query.studentId;
  if (!id) return res.status(400).json({ success: false, message: 'sid (studentId) query param is required.' });
  req.params.studentId = id;
  next();
}

/* Read */
router.get('/summary',   sid, sfc.getSummary);
router.get('/charges',   sid, sfc.getCharges);
router.get('/payments',  sid, sfc.getPayments);
router.get('/levies',    sid, sfc.getLevies);
router.get('/ledger',    sid, sfc.getLedger);
router.get('/statement', sid, sfc.getStatement);
router.get('/export',    sid, sfc.exportCSV);
router.get('/receipt/:paymentId', sid, sfc.getReceipt);

/* Write */
router.post('/pay',        sid, adminTeacherBursar,          sfc.recordPayment);
router.post('/charge',     sid, adminTeacherBursar,          sfc.addCharge);
router.post('/adjustment', sid, authorize('Admin','Bursar'),  sfc.addAdjustment);

module.exports = router;