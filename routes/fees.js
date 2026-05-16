'use strict';
const express       = require('express');
const fc            = require('../controllers/feesController');
const { authenticate, authorize } = require('../middleware/auth');

const router    = express.Router();
const adminOnly = authorize('Admin');
router.use(authenticate);

/* ── Fee Structure ── */
router.get('/structure/for-class',       fc.getStructureForClass);
router.get('/structure',                 fc.getStructure);
router.post('/structure/assign-class',   adminOnly, fc.assignFeeToClass);
router.post('/structure/assign-level',   adminOnly, fc.assignFeeToLevel);
router.post('/structure',                adminOnly, fc.addStructureItem);
router.put('/structure/:id',             adminOnly, fc.updateStructureItem);
router.delete('/structure/:id',          adminOnly, fc.deleteStructureItem);

/* ── Ledger ── */
router.get('/ledger-summary',            fc.getLedgerSummary);
router.get('/ledger/:studentId',         fc.getLedger);
router.get('/ledger-export/:studentId',  fc.exportLedgerCSV);
router.post('/ledger/adjustment',        adminOnly, fc.addLedgerAdjustment);

/* ── Aggregates ── */
router.get('/summary',                   fc.getSummary);
router.get('/export/csv',                fc.exportCSV);
router.get('/student/:studentId',        fc.getByStudent);

/* ── Payments CRUD ── */
router.get('/',                          fc.getAll);
router.post('/bulk-charge',              adminOnly, fc.bulkCharge);
router.post('/',                         adminOnly, fc.create);
router.get('/:id',                       fc.getOne);
router.put('/:id',                       adminOnly, fc.update);
router.patch('/:id/status',              adminOnly, fc.updateStatus);
router.delete('/:id',                    adminOnly, fc.remove);

module.exports = router;