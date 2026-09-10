'use strict';
/**
 * routes/studentFinance.js — Sacred Heart College
 *
 * Key changes vs original:
 *  • All GET (read) endpoints accept parent JWT via parentAuth.
 *    requireOwnStudent ensures parents only see their ward's data.
 *    The ?sid= query param is bridged to req.params.studentId via sidToParam.
 *  • All POST/PATCH/DELETE (write) endpoints still require staff JWT.
 */

const express = require('express');
const fc      = require('../controllers/studentFinanceController');
const { authenticate, authorize }       = require('../middleware/auth');
const { parentAuth, requireOwnStudent } = require('../middleware/parentAuth');

const router      = express.Router();
const adminBursar = [authenticate, authorize('Admin', 'Bursar')];
const adminOnly   = [authenticate, authorize('Admin')];

/* ── Bridge ?sid= query param into req.params for requireOwnStudent ── */
function sidToParam(req, _res, next) {
  if (req.query.sid && !req.params.studentId) {
    req.params.studentId = req.query.sid;
  }
  next();
}

/* ═══════════════════════════════════════════════════════════════════════
   READ endpoints — parent JWT OR staff JWT accepted
═══════════════════════════════════════════════════════════════════════ */

router.get('/summary',  sidToParam, parentAuth, requireOwnStudent, fc.getSummary);
router.get('/charges',  sidToParam, parentAuth, requireOwnStudent, fc.getCharges);
router.get('/payments', sidToParam, parentAuth, requireOwnStudent, fc.getPayments);
router.get('/levies',   sidToParam, parentAuth, requireOwnStudent, fc.getLevies);
router.get('/ledger',   sidToParam, parentAuth, requireOwnStudent, fc.getLedger);

/* ═══════════════════════════════════════════════════════════════════════
   STAFF-ONLY exports & class views
═══════════════════════════════════════════════════════════════════════ */

router.get('/export',         ...adminBursar, fc.exportCSV);
router.get('/export-class',   ...adminBursar, fc.exportClassCSV);
router.get('/class-summary',  ...adminBursar, fc.getClassSummary);

/* ═══════════════════════════════════════════════════════════════════════
   WRITE endpoints — staff only
═══════════════════════════════════════════════════════════════════════ */

// Record a payment against an existing charge
router.post('/pay',         ...adminBursar, fc.recordPayment);

// Pay all outstanding charges in one bulk payment
router.post('/pay-all',     ...adminBursar, fc.payAll);

// Add a single charge / direct payment
router.post('/charge',      ...adminBursar, fc.addCharge);

// Bulk assign a fee to an entire class
router.post('/bulk-charge', ...adminBursar, fc.bulkCharge);

// Manual ledger adjustment — Admin only
router.post('/adjustment',  ...adminOnly,   fc.addAdjustment);

module.exports = router;