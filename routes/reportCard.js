'use strict';

const express              = require('express');
const reportCardController = require('../controllers/reportCardController');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

// All report card routes require authentication
router.use(authenticate);

/* ── Special routes (must come before /:studentId) ───────────────────────────
   Same ordering discipline as resultRoutes — named segments before params.
   ─────────────────────────────────────────────────────────────────────────── */

// GET /api/report-cards?class=&arm=&term=&session=
// Generates report cards for all students in a class/arm.
// Admin → any class. Teacher → assigned class/arm only.
router.get('/', reportCardController.generate);

// GET /api/report-cards/class-summary?class=&arm=&term=&session=
// Returns lightweight position/average table — must be above /:studentId.
router.get('/class-summary', reportCardController.classSummary);

/* ── Per-student routes ──────────────────────────────────────────────────── */

// GET /api/report-cards/:studentId?term=&session=
// Full report card for a single student.
// Admin, Teacher (assigned class), Parent (own ward only).
router.get('/:studentId', reportCardController.getOne);

// PATCH /api/report-cards/:studentId/remarks
// Save/update teacher or principal remark.
// body: { term, session, type: 'teacher'|'principal', value }
// Teacher → teacherRemark only. Admin → both.
router.patch(
  '/:studentId/remarks',
  authorize('Admin', 'Teacher'),
  reportCardController.saveRemark
);

// GET /api/report-cards/:studentId/domains?term=&session=
// Returns cognitive / affective / psychomotor / behavior scores.
router.get('/:studentId/domains', reportCardController.getDomains);

// PUT /api/report-cards/:studentId/domains?term=&session=
// Create or replace domain assessment record.
// body: { cognitive?, affective?, psychomotor?, behavior?: { trait: 1-5 } }
router.put(
  '/:studentId/domains',
  authorize('Admin', 'Teacher'),
  reportCardController.setDomains
);

module.exports = router;