'use strict';

/**
 * reFormRoutes.js — Sacred Heart College (SAHARCO)
 * Mount at: /api/reforms
 */

const express          = require('express');
const reFormController = require('../controllers/reFormController');
const { authenticate, authorize } = require('../middleware/auth');

const router    = express.Router();
const adminOnly = authorize('Admin');
const staffOnly = authorize('Admin', 'Teacher');

router.use(authenticate);

/* ── Named routes — BEFORE /:id ─────────────────────────────────────────── */

// GET /api/reforms/stats?session=
// Returns counts by type and status — used by dashboard.
router.get('/stats',                  staffOnly, reFormController.getStats);

// GET /api/reforms/student/:studentId
// All reform history for one student.
router.get('/student/:studentId',     staffOnly, reFormController.getByStudent);

/* ── Collection CRUD ────────────────────────────────────────────────────── */

// GET  /api/reforms?type=&status=&studentId=&session=&term=&page=&limit=
router.get('/',    staffOnly, reFormController.getAll);

// POST /api/reforms
// body: { studentId, type, fromClass, fromArm, toClass, toArm, fromSession, toSession, term }
router.post('/',   adminOnly, reFormController.create);

/* ── Per-record — /:id last ──────────────────────────────────────────────── */

// GET    /api/reforms/:id
router.get('/:id',             staffOnly, reFormController.getOne);

// PUT    /api/reforms/:id   (Pending forms only)
router.put('/:id',             adminOnly, reFormController.update);

// PATCH  /api/reforms/:id/approve   body: { notes? }
router.patch('/:id/approve',   adminOnly, reFormController.approve);

// PATCH  /api/reforms/:id/reject    body: { notes? }
router.patch('/:id/reject',    adminOnly, reFormController.reject);

// DELETE /api/reforms/:id
router.delete('/:id',          adminOnly, reFormController.remove);

module.exports = router;