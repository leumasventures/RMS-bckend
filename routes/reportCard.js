'use strict';

/**
 * reportCardRoutes.js — Sacred Heart College (SAHARCO)
 * Mount at: /api/report-cards
 */

const express              = require('express');
const reportCardController = require('../controllers/reportCardController');
const { authenticate, authorize } = require('../middleware/auth');

const router    = express.Router();
const staffOnly = authorize('Admin', 'Teacher');

router.use(authenticate);

/* ── Named / aggregate routes — BEFORE /:studentId ─────────────────────── */

// GET /api/report-cards?class=&arm=&term=&session=
// Batch: generates cards for every student in a class/arm.
router.get('/', staffOnly, reportCardController.generate);

// GET /api/report-cards/class-summary?class=&arm=&term=&session=
// Lightweight ranked position table for a class.
router.get('/class-summary', staffOnly, reportCardController.classSummary);

/* ── Per-student routes — /:studentId last ──────────────────────────────── */

// GET /api/report-cards/:studentId?term=&session=
// Full report card. Admin + Teacher (assigned class) + Parent (own ward).
router.get('/:studentId', reportCardController.getOne);

// PATCH /api/report-cards/:studentId/remarks
// body: { term, session, type: 'teacher'|'principal', value }
// Teacher → teacherRemark only. Admin → either.
router.patch(
  '/:studentId/remarks',
  staffOnly,
  reportCardController.saveRemark
);

// GET /api/report-cards/:studentId/domains?term=&session=
// Returns cognitive / affective / psychomotor / behavior scores.
router.get('/:studentId/domains', reportCardController.getDomains);

// PUT /api/report-cards/:studentId/domains?term=&session=
// body: { cognitive?, affective?, psychomotor?, behavior?: { trait: 1-5 } }
// Supports partial updates (merges with existing record).
router.put(
  '/:studentId/domains',
  staffOnly,
  reportCardController.setDomains
);

module.exports = router;