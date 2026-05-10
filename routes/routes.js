'use strict';

/**
 * routes/routes.js — Sacred Heart College (SAHARCO)
 * ──────────────────────────────────────────────────
 * Portal API router — parent portal + check-result endpoints.
 *
 * Mount in server.js:
 *   app.use('/api', require('./routes/routes'));
 *
 * Access rules:
 *   /api/parent-portal/*  → Parent, Admin
 *   /api/check-result/*   → Parent, Teacher, Admin
 *   (individual controllers enforce student-level access)
 */

const express = require('express');
const router  = express.Router();

const parentPortalCtrl = require('../controllers/parentPortalController');
const checkResultCtrl  = require('../controllers/checkResultController');

const {
  authenticate,
  authorize,
  childAccessGuard,
  rateLimiter,
} = require('../middleware/auth');

/* ── Global middleware ────────────────────────────────────────────────────── */
router.use(rateLimiter);
router.use(authenticate);

/* ═══════════════════════════════════════════════════════════════════════════
   PARENT PORTAL   /api/parent-portal/*
   Role: Parent, Admin
═══════════════════════════════════════════════════════════════════════════ */
router.use('/parent-portal', authorize('Parent', 'Admin'));

// GET /api/parent-portal/children
// All children linked to the logged-in parent (bio, class, arm, photo).
router.get('/parent-portal/children', parentPortalCtrl.getChildren);

// GET /api/parent-portal/summary/:studentId?term=&session=
// Stat cards: avg score, class position, attendance %, term trend.
router.get(
  '/parent-portal/summary/:studentId',
  childAccessGuard,
  parentPortalCtrl.getStudentSummary
);

// GET /api/parent-portal/subjects/:studentId?term=&session=
// Subject performance grid: name, teacher, score, grade, colour.
router.get(
  '/parent-portal/subjects/:studentId',
  childAccessGuard,
  parentPortalCtrl.getSubjectScores
);

// GET /api/parent-portal/attendance/:studentId?term=&session=&month=
// Day-by-day attendance for heatmap calendar widget.
router.get(
  '/parent-portal/attendance/:studentId',
  childAccessGuard,
  parentPortalCtrl.getAttendance
);

// GET /api/parent-portal/recent-assessments/:studentId?term=&session=&limit=&subject=
// Most recent N graded assessments.
router.get(
  '/parent-portal/recent-assessments/:studentId',
  childAccessGuard,
  parentPortalCtrl.getRecentAssessments
);

// GET /api/parent-portal/all-terms/:studentId
// Year-on-year summary: avg + class position per term.
router.get(
  '/parent-portal/all-terms/:studentId',
  childAccessGuard,
  parentPortalCtrl.getAllTermsResult
);

/* ═══════════════════════════════════════════════════════════════════════════
   CHECK RESULT   /api/check-result/*
   Role: Parent, Teacher, Admin
   (controllers enforce per-student access internally)
═══════════════════════════════════════════════════════════════════════════ */
router.use('/check-result', authorize('Parent', 'Teacher', 'Admin'));

// GET /api/check-result/available-terms/:studentId?session=
// (term, session) pairs that have results — populates term dropdown.
router.get(
  '/check-result/available-terms/:studentId',
  childAccessGuard,
  checkResultCtrl.getAvailableTerms
);

// GET /api/check-result/sheet/:studentId?term=&session=
// Full terminal result sheet — main payload for checkResult.html.
router.get(
  '/check-result/sheet/:studentId',
  childAccessGuard,
  checkResultCtrl.getResultSheet
);

// GET /api/check-result/subject-detail/:studentId/:subjectCode?term=&session=
// Single-subject deep-dive: CA1, CA2, exam breakdown + class comparison.
router.get(
  '/check-result/subject-detail/:studentId/:subjectCode',
  childAccessGuard,
  checkResultCtrl.getSubjectDetail
);

// GET /api/check-result/term-trend/:studentId
// Multi-term average trend for the line chart.
router.get(
  '/check-result/term-trend/:studentId',
  childAccessGuard,
  checkResultCtrl.getTermTrend
);

// GET /api/check-result/class-comparison/:studentId?term=&session=
// Per-subject: studentScore | classAverage | classHighest.
router.get(
  '/check-result/class-comparison/:studentId',
  childAccessGuard,
  checkResultCtrl.getClassComparison
);

// GET /api/check-result/assessments/:studentId?term=&session=&subject=&limit=
// All individual assessment records for a term.
router.get(
  '/check-result/assessments/:studentId',
  childAccessGuard,
  checkResultCtrl.getAllAssessments
);

// GET /api/check-result/report-card/:studentId?term=&session=
// Complete printable report-card payload.
router.get(
  '/check-result/report-card/:studentId',
  childAccessGuard,
  checkResultCtrl.getReportCard
);

/* ── 404 within this router ──────────────────────────────────────────────── */
router.all('*', (req, res) => {
  res.status(404).json({
    success:    false,
    error:      `Cannot ${req.method} ${req.originalUrl} — endpoint not found.`,
    statusCode: 404,
  });
});

module.exports = router;