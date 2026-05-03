'use strict';

const express         = require('express');
const feesController  = require('../controllers/feesController');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

/* ── Named routes — before /:id to avoid param capture ──────────────────── */

// GET  /api/fees/structure                           — any authenticated user
router.get('/structure', feesController.getStructure);

// POST /api/fees/structure        body: { label, amount, level }
router.post('/structure', authorize('Admin'), feesController.addStructureItem);

// PUT  /api/fees/structure/:id    body: { label?, amount?, level? }
router.put('/structure/:id', authorize('Admin'), feesController.updateStructureItem);

// DELETE /api/fees/structure/:id
router.delete('/structure/:id', authorize('Admin'), feesController.deleteStructureItem);

// GET /api/fees/summary?term=&session=               — Admin / Teacher
router.get('/summary', feesController.getSummary);

// GET /api/fees/student/:studentId?term=&session=    — Admin / Teacher / Parent (own ward)
router.get('/student/:studentId', feesController.getByStudent);

// GET /api/fees/export/csv?term=&session=            — Admin / Teacher
router.get('/export/csv', feesController.exportCSV);

/* ── Collection CRUD ─────────────────────────────────────────────────────── */

// GET  /api/fees?studentId=&class=&arm=&term=&session=&status=&feeType=
router.get('/', feesController.getAll);

// POST /api/fees   body: { studentId, feeType, amount, date, term, status?, session? }
router.post('/', authorize('Admin'), feesController.create);

/* ── Per-record operations — /:id last ───────────────────────────────────── */

// GET    /api/fees/:id
router.get('/:id', feesController.getOne);

// PUT    /api/fees/:id
router.put('/:id', authorize('Admin'), feesController.update);

// PATCH  /api/fees/:id/status   body: { status }
router.patch('/:id/status', authorize('Admin'), feesController.updateStatus);

// DELETE /api/fees/:id
router.delete('/:id', authorize('Admin'), feesController.remove);

module.exports = router;