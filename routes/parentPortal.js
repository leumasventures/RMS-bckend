/* ============================================================
   Sacred Heart College Eziukwu Aba – School Portal
   routes/routes.js  |  Portal API Router
   ============================================================
   Mount in server.js:
     app.use('/api', require('./routes/routes'));
   ============================================================ */

'use strict';

const express = require('express');
const router  = express.Router();

const parentPortalCtrl = require('../controllers/parentPortalController');
const checkResultCtrl  = require('../controllers/checkResultController');

const {
  authMiddleware,
  requireRole,
  childAccessGuard,
  rateLimiter,
} = require('../middleware/auth');

/* ─────────────────────────────────────────────────────────────
   GLOBAL MIDDLEWARE  (applied to every route in this router)
   Order matters: rate-limit → auth → role check
───────────────────────────────────────────────────────────── */
router.use(rateLimiter);
router.use(authMiddleware);

/* ═══════════════════════════════════════════════════════════
   PARENT PORTAL ROUTES  —  /api/parent-portal/*
   All require role = Parent (or Admin for impersonation)
═══════════════════════════════════════════════════════════ */
router.use('/parent-portal', requireRole('Parent', 'Admin'));

/**
 * GET /api/parent-portal/children
 * List of all children linked to the logged-in parent.
 * No :studentId param — session provides the child list.
 */
router.get(
  '/parent-portal/children',
  parentPortalCtrl.getChildren
);

/**
 * GET /api/parent-portal/summary/:studentId
 * Stat-card data: avg, class position, attendance, trend.
 * ?term=second&session=2024/2025
 */
router.get(
  '/parent-portal/summary/:studentId',
  childAccessGuard,
  parentPortalCtrl.getStudentSummary
);

/**
 * GET /api/parent-portal/subjects/:studentId
 * Subject performance grid: name, teacher, score, grade, colour.
 * ?term=second&session=2024/2025
 */
router.get(
  '/parent-portal/subjects/:studentId',
  childAccessGuard,
  parentPortalCtrl.getSubjectScores
);

/**
 * GET /api/parent-portal/attendance/:studentId
 * Attendance counts + calendar grid.
 * ?term=second&session=2024/2025&month=3
 */
router.get(
  '/parent-portal/attendance/:studentId',
  childAccessGuard,
  parentPortalCtrl.getAttendance
);

/**
 * GET /api/parent-portal/recent-assessments/:studentId
 * Most recent N assessments.
 * ?term=second&session=2024/2025&limit=5&subject=MTH
 */
router.get(
  '/parent-portal/recent-assessments/:studentId',
  childAccessGuard,
  parentPortalCtrl.getRecentAssessments
);

/**
 * GET /api/parent-portal/all-terms/:studentId
 * Year-on-year term history: avg + position per term.
 */
router.get(
  '/parent-portal/all-terms/:studentId',
  childAccessGuard,
  parentPortalCtrl.getAllTermsResult
);

/* ═══════════════════════════════════════════════════════════
   CHECK RESULT ROUTES  —  /api/check-result/*
   Parent, Teacher, and Admin may all access these —
   each controller enforces its own access rules internally.
═══════════════════════════════════════════════════════════ */
router.use('/check-result', requireRole('Parent', 'Teacher', 'Admin'));

/**
 * GET /api/check-result/available-terms/:studentId
 * Which (term, session) pairs have results for this student.
 * ?session=2024/2025
 */
router.get(
  '/check-result/available-terms/:studentId',
  childAccessGuard,
  checkResultCtrl.getAvailableTerms
);

/**
 * GET /api/check-result/sheet/:studentId
 * Full terminal result sheet.
 * ?session=2024/2025&term=Second+Term
 */
router.get(
  '/check-result/sheet/:studentId',
  childAccessGuard,
  checkResultCtrl.getResultSheet
);

/**
 * GET /api/check-result/subject-detail/:studentId/:subjectCode
 * Deep dive: CA1, CA2, exam breakdown + class comparison.
 * ?session=2024/2025&term=Second+Term
 */
router.get(
  '/check-result/subject-detail/:studentId/:subjectCode',
  childAccessGuard,
  checkResultCtrl.getSubjectDetail
);

/**
 * GET /api/check-result/term-trend/:studentId
 * Multi-term average trend for the line chart.
 */
router.get(
  '/check-result/term-trend/:studentId',
  childAccessGuard,
  checkResultCtrl.getTermTrend
);

/**
 * GET /api/check-result/class-comparison/:studentId
 * Per-subject: studentScore | classAverage | classHighest.
 * ?session=2024/2025&term=Second+Term
 */
router.get(
  '/check-result/class-comparison/:studentId',
  childAccessGuard,
  checkResultCtrl.getClassComparison
);

/**
 * GET /api/check-result/assessments/:studentId
 * All individual assessment records for a term.
 * ?session=2024/2025&term=Second+Term&subject=MTH&limit=20
 */
router.get(
  '/check-result/assessments/:studentId',
  childAccessGuard,
  checkResultCtrl.getAllAssessments
);

/**
 * GET /api/check-result/report-card/:studentId
 * Complete printable report-card payload.
 * ?session=2024/2025&term=Second+Term
 */
router.get(
  '/check-result/report-card/:studentId',
  childAccessGuard,
  checkResultCtrl.getReportCard
);

/* ─────────────────────────────────────────────────────────────
   404  (unmatched route within this router)
───────────────────────────────────────────────────────────── */
router.all('*', (req, res) => {
  res.status(404).json({
    success:    false,
    error:      `Cannot ${req.method} ${req.originalUrl} — endpoint not found.`,
    statusCode: 404,
  });
});

module.exports = router;