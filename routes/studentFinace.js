'use strict';
/**
 * routes/studentFinance.js
 * Mount at: /api/student-finance
 *
 * All routes are student-scoped: /:studentId/...
 * Access guard in controller: Admin / Teacher / the student / their parent
 */

const express  = require('express');
const sfc      = require('../controllers/studentFinanceController');
const { authenticate, authorize } = require('../middleware/auth');

const router   = express.Router();
const adminTeacherBursar = authorize('Admin', 'Teacher', 'Bursar');

router.use(authenticate);   // every route requires a valid token

/* ── Read (Admin / Teacher / Bursar / Student / Parent) ─────────────────── */
router.get('/:studentId/summary',   sfc.getSummary);
router.get('/:studentId/charges',   sfc.getCharges);
router.get('/:studentId/payments',  sfc.getPayments);
router.get('/:studentId/levies',    sfc.getLevies);
router.get('/:studentId/ledger',    sfc.getLedger);
router.get('/:studentId/statement', sfc.getStatement);
router.get('/:studentId/receipt/:paymentId', sfc.getReceipt);
router.get('/:studentId/export',    sfc.exportCSV);

/* ── Write (Admin / Teacher / Bursar) ───────────────────────────────────── */
router.post('/:studentId/pay',        adminTeacherBursar, sfc.recordPayment);
router.post('/:studentId/charge',     adminTeacherBursar, sfc.addCharge);
router.post('/:studentId/adjustment', authorize('Admin', 'Bursar'), sfc.addAdjustment);

module.exports = router;