'use strict';
const express       = require('express');
const fc            = require('../controllers/feesController');
const { authenticate, authorize } = require('../middleware/auth');

const router        = express.Router();
const adminOnly     = authorize('Admin');           // Admin only: delete, adjustments
const adminBursar   = authorize('Admin', 'Bursar'); // Admin + Bursar: create, update, charge
router.use(authenticate);

/* ── Fee Structure ── */
router.get('/structure/for-class',       fc.getStructureForClass);
router.get('/structure',                 fc.getStructure);
router.post('/structure/assign-class',   adminBursar, fc.assignFeeToClass);
router.post('/structure/assign-level',   adminBursar, fc.assignFeeToLevel);
router.post('/structure',                adminBursar, fc.addStructureItem);
router.put('/structure/:id',             adminBursar, fc.updateStructureItem);
router.delete('/structure/:id',          adminOnly,   fc.deleteStructureItem);  // Admin only

/* ── Ledger ── */
router.get('/ledger-summary',            fc.getLedgerSummary);
router.get('/ledger/:studentId',         fc.getLedger);
router.get('/ledger-export/:studentId',  fc.exportLedgerCSV);
router.post('/ledger/adjustment',        adminOnly,   fc.addLedgerAdjustment);  // Admin only

/* ── Aggregates ── */
router.get('/summary',                   fc.getSummary);
router.get('/export/csv',                fc.exportCSV);
router.get('/student/:studentId',        fc.getByStudent);

/* ── Payments CRUD ── */
router.get('/',                          fc.getAll);
router.post('/bulk-charge',              adminBursar, fc.bulkCharge);
router.post('/',                         adminBursar, fc.create);
router.get('/:id',                       fc.getOne);
router.put('/:id',                       adminBursar, fc.update);
router.patch('/:id/status',              adminBursar, fc.updateStatus);
router.delete('/:id',                    adminOnly,   fc.remove);  // Admin only

module.exports = router;