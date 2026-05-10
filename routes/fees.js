'use strict';

const express        = require('express');
const feeController  = require('../controllers/feesController');   // feeController, not feesController
const { authenticate, authorize } = require('../middleware/auth');

const router    = express.Router();
const adminOnly = authorize('Admin');

router.use(authenticate);

/* ── Fee structure — BEFORE /:id ───────────────────────────────────────── */

// GET    /api/fees/structure
router.get('/structure',          feeController.getStructure);

// POST   /api/fees/structure      body: { label, amount, level? }
router.post('/structure',         adminOnly, feeController.addStructureItem);

// PUT    /api/fees/structure/:id  body: { label?, amount?, level? }
router.put('/structure/:id',      adminOnly, feeController.updateStructureItem);

// DELETE /api/fees/structure/:id
router.delete('/structure/:id',   adminOnly, feeController.deleteStructureItem);

/* ── Named aggregate routes — BEFORE /:id ──────────────────────────────── */

// GET /api/fees/summary?term=&session=
router.get('/summary',              feeController.getSummary);

// GET /api/fees/export/csv?term=&session=
router.get('/export/csv',           feeController.exportCSV);

// GET /api/fees/student/:studentId?term=&session=
router.get('/student/:studentId',   feeController.getByStudent);

/* ── Collection CRUD ────────────────────────────────────────────────────── */

// GET  /api/fees?studentId=&class=&arm=&term=&session=&status=&feeType=
router.get('/',   feeController.getAll);

// POST /api/fees  body: { studentId, feeType, amount, date, term, status?, session? }
router.post('/',  adminOnly, feeController.create);

/* ── Per-record operations — /:id last ─────────────────────────────────── */

// GET    /api/fees/:id
router.get('/:id',            feeController.getOne);

// PUT    /api/fees/:id
router.put('/:id',            adminOnly, feeController.update);

// PATCH  /api/fees/:id/status   body: { status }
router.patch('/:id/status',   adminOnly, feeController.updateStatus);

// DELETE /api/fees/:id
router.delete('/:id',         adminOnly, feeController.remove);

module.exports = router;