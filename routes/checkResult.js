/* ============================================================
   Sacred Heart College Eziukwu Aba – School Portal
   routes.js  |  Parent Portal + Check Result API Routes
   ============================================================
   Mount this file in your main app.js / server.js:

     const portalRoutes = require('./routes/routes');
     app.use('/api', portalRoutes);

   All routes under /api/parent-portal and /api/check-result
   require a valid Parent session (x-shc-session header or
   cookie — enforced inside each controller).
   ============================================================ */

'use strict';

const express = require('express');
const router  = express.Router();

/* ── Controllers ── */
const parentPortalCtrl  = require('../controllers/parentPortalController');
const checkResultCtrl   = require('../controllers/checkResultController');

/* ── Middleware ── */
const { authMiddleware, requireRole, rateLimiter } = require('../middleware/auth');

/*
  authMiddleware   – validates the session / JWT from the request.
  requireRole      – asserts the caller has the specified role.
  rateLimiter      – throttles requests per IP (protects against scraping).

  Replace these with your actual middleware implementations.
  Example skeleton:

    exports.authMiddleware = (req, res, next) => {
      try {
        const raw  = req.headers['x-shc-session'];
        req.session = JSON.parse(Buffer.from(raw, 'base64').toString('utf8'));
        if (!req.session) return res.status(401).json({ error: 'Not authenticated.' });
        next();
      } catch { res.status(401).json({ error: 'Invalid session.' }); }
    };

    exports.requireRole = (...roles) => (req, res, next) => {
      if (!roles.includes(req.session?.role))
        return res.status(403).json({ error: 'Forbidden.' });
      next();
    };

    exports.rateLimiter = require('express-rate-limit')({
      windowMs: 60_000,   // 1 minute
      max: 60,            // 60 requests per minute per IP
      message: { error: 'Too many requests. Please slow down.' },
    });
*/

/* ─────────────────────────────────────────────────────────────
   GLOBAL MIDDLEWARE for all routes in this file
   Every request must be authenticated as a Parent.
───────────────────────────────────────────────────────────── */
router.use(rateLimiter);
router.use(authMiddleware);
router.use(requireRole('Parent'));

/* ═══════════════════════════════════════════════════════════
   PARENT PORTAL ROUTES
   Base: /api/parent-portal/…
═══════════════════════════════════════════════════════════ */

/**
 * GET /api/parent-portal/children
 * ─────────────────────────────────
 * Returns the full list of children linked to the logged-in
 * parent (bio, class, arm, photo URL).
 *
 * Used by: parentsPortal.html – children tabs, overview cards
 *
 * Response 200:
 *   { success, count, data: [ { studentId, name, class, arm, gender, ... } ] }
 */
router.get(
  '/parent-portal/children',
  parentPortalCtrl.getChildren
);

/**
 * GET /api/parent-portal/summary/:studentId
 * ──────────────────────────────────────────
 * Dashboard summary card for one child:
 *   average score, class position, attendance %, term trend.
 *
 * Query params (all optional):
 *   term           – 'first' | 'second' | 'third'  (default: 'second')
 *   session        – e.g. '2024/2025'               (default: '2024/2025')
 *
 * Used by: parentsPortal.html – stat cards row
 */
router.get(
  '/parent-portal/summary/:studentId',
  parentPortalCtrl.getStudentSummary
);

/**
 * GET /api/parent-portal/subjects/:studentId
 * ────────────────────────────────────────────
 * Subject-by-subject scores for the portal subject cards.
 * Returns: subjectName, teacherName, score, grade, colour, progress.
 *
 * Query params: term, session
 *
 * Used by: parentsPortal.html – subject performance grid
 */
router.get(
  '/parent-portal/subjects/:studentId',
  parentPortalCtrl.getSubjectScores
);

/**
 * GET /api/parent-portal/attendance/:studentId
 * ─────────────────────────────────────────────
 * Day-by-day attendance for the heatmap calendar widget.
 *
 * Query params: term, session, month (1–12, optional)
 *
 * Used by: parentsPortal.html – attendance panel
 */
router.get(
  '/parent-portal/attendance/:studentId',
  parentPortalCtrl.getAttendance
);

/**
 * GET /api/parent-portal/recent-assessments/:studentId
 * ──────────────────────────────────────────────────────
 * Most recent N graded assessments for the "Recent Assessments"
 * panel (default last 5).
 *
 * Query params: term, session, limit (default: 5)
 *
 * Used by: parentsPortal.html – recent assessments panel
 */
router.get(
  '/parent-portal/recent-assessments/:studentId',
  parentPortalCtrl.getRecentAssessments
);

/**
 * GET /api/parent-portal/all-terms/:studentId
 * ─────────────────────────────────────────────
 * Year-on-year summary: average + class position per term.
 *
 * Used by: parentsPortal.html – term history (if rendered)
 */
router.get(
  '/parent-portal/all-terms/:studentId',
  parentPortalCtrl.getAllTermsResult
);

/* ═══════════════════════════════════════════════════════════
   CHECK RESULT ROUTES
   Base: /api/check-result/…
═══════════════════════════════════════════════════════════ */

/**
 * GET /api/check-result/available-terms/:studentId
 * ──────────────────────────────────────────────────
 * Every (term, session) pair for which results exist —
 * used to populate the term selector dropdown on checkResult.html.
 *
 * Response 200:
 *   { success, count, data: [ { term, academicSession, label, value, isCurrent } ] }
 *
 * Used by: checkResult.html – term selector dropdown
 */
router.get(
  '/check-result/available-terms/:studentId',
  checkResultCtrl.getAvailableTerms
);

/**
 * GET /api/check-result/sheet/:studentId
 * ────────────────────────────────────────
 * Full result sheet — main data payload for checkResult.html.
 * Returns student bio, all subjects (CA1 + CA2 + exam + total),
 * class ranking, attendance summary, and teacher/principal remarks.
 *
 * Query params: term, session
 *
 * Used by: checkResult.html – main result table
 */
router.get(
  '/check-result/sheet/:studentId',
  checkResultCtrl.getResultSheet
);

/**
 * GET /api/check-result/subject-detail/:studentId/:subjectCode
 * ─────────────────────────────────────────────────────────────
 * Single-subject deep-dive:
 *   • CA1, CA2, Exam breakdown
 *   • Individual assessment history
 *   • Class comparison (student vs average vs highest)
 *   • Teacher name + remark
 *
 * Query params: term, session
 *
 * Used by: checkResult.html – subject drill-down modal
 */
router.get(
  '/check-result/subject-detail/:studentId/:subjectCode',
  checkResultCtrl.getSubjectDetail
);

/**
 * GET /api/check-result/term-trend/:studentId
 * ─────────────────────────────────────────────
 * Multi-term performance trend:
 *   averageScore + classAverage per (term, session) + delta.
 *
 * Used by: checkResult.html – trend line chart
 */
router.get(
  '/check-result/term-trend/:studentId',
  checkResultCtrl.getTermTrend
);

/**
 * GET /api/check-result/class-comparison/:studentId
 * ───────────────────────────────────────────────────
 * Per-subject: studentScore | classAverage | classHighest.
 * Drives the comparison bar/radar chart.
 *
 * Query params: term, session
 *
 * Used by: checkResult.html – comparison chart section
 */
router.get(
  '/check-result/class-comparison/:studentId',
  checkResultCtrl.getClassComparison
);

/**
 * GET /api/check-result/assessments/:studentId
 * ─────────────────────────────────────────────
 * All individual assessment scores (CA tests, practicals,
 * assignments) for a student in a given term.
 *
 * Query params: term, session, subject (optional subject code), limit
 *
 * Used by: checkResult.html – full assessments table
 */
router.get(
  '/check-result/assessments/:studentId',
  checkResultCtrl.getAllAssessments
);

/**
 * GET /api/check-result/report-card/:studentId
 * ─────────────────────────────────────────────
 * Printable report card payload — includes all result data
 * plus school info, grading key, promotion status, and
 * next-term details for the report card header/footer.
 *
 * Query params: term, session
 *
 * Used by: checkResult.html – print / download report card
 */
router.get(
  '/check-result/report-card/:studentId',
  checkResultCtrl.getReportCard
);

/* ─────────────────────────────────────────────────────────────
   CATCH-ALL  (404 within this router)
───────────────────────────────────────────────────────────── */
router.all('*', (req, res) => {
  res.status(404).json({
    success: false,
    error:   `Cannot ${req.method} ${req.originalUrl} — route not found in SHC portal API.`,
  });
});

module.exports = router;


/* ─────────────────────────────────────────────────────────────
   QUICK REFERENCE  —  all routes at a glance
   ─────────────────────────────────────────────────────────────

   PARENT PORTAL
   GET /api/parent-portal/children
   GET /api/parent-portal/summary/:studentId          ?term &session
   GET /api/parent-portal/subjects/:studentId         ?term &session
   GET /api/parent-portal/attendance/:studentId       ?term &session &month
   GET /api/parent-portal/recent-assessments/:studentId  ?term &session &limit
   GET /api/parent-portal/all-terms/:studentId

   CHECK RESULT
   GET /api/check-result/available-terms/:studentId
   GET /api/check-result/sheet/:studentId              ?term &session
   GET /api/check-result/subject-detail/:studentId/:subjectCode  ?term &session
   GET /api/check-result/term-trend/:studentId
   GET /api/check-result/class-comparison/:studentId   ?term &session
   GET /api/check-result/assessments/:studentId        ?term &session &subject &limit
   GET /api/check-result/report-card/:studentId        ?term &session

   ─────────────────────────────────────────────────────────────
   FRONTEND USAGE EXAMPLE (fetch from parentsPortal.html)
   ─────────────────────────────────────────────────────────────

   // Encode the session for the header
   const encoded = btoa(JSON.stringify(SHC_Auth.getSession()));
   const headers = { 'x-shc-session': encoded };

   // Load children
   const children = await fetch('/api/parent-portal/children', { headers })
     .then(r => r.json());

   // Load summary for first child
   const summary = await fetch(
     `/api/parent-portal/summary/${children.data[0].studentId}?term=second&session=2024/2025`,
     { headers }
   ).then(r => r.json());

   // Load full result sheet for checkResult.html
   const sheet = await fetch(
     `/api/check-result/sheet/${studentId}?term=second&session=2024/2025`,
     { headers }
   ).then(r => r.json());

   ─────────────────────────────────────────────────────────────
   ERROR RESPONSES
   ─────────────────────────────────────────────────────────────

   401  Not authenticated (missing or invalid session)
   403  Forbidden (wrong role, or studentId not linked to parent)
   404  Resource not found (student, result, subject)
   429  Too many requests (rate limiter triggered)
   500  Internal server error

   All errors follow the format:
   { success: false, error: "message", statusCode: 4xx | 5xx }

───────────────────────────────────────────────────────────── */