'use strict';
/**
 * routes/results.js — Sacred Heart College
 *
 * Key changes vs original:
 *  • GET /student/:studentId   — now parent-accessible (parentAuth + requireOwnStudent)
 *  • GET /report-card/:studentId — parent-accessible
 *  • GET /remarks/:studentId   — parent-accessible
 *  • All write operations still require staff JWT
 */

const express = require('express');
const rc      = require('../controllers/resultsController');
const { authenticate, authorize }       = require('../middleware/auth');
const { parentAuth, requireOwnStudent } = require('../middleware/parentAuth');

const router    = express.Router();
const adminOnly = authorize('Admin');
const staffOnly = authorize('Admin', 'Teacher');

/* ═══════════════════════════════════════════════════════════════════════
   PARENT + STAFF read routes
   parentAuth accepts either a parent JWT or a staff JWT.
   requireOwnStudent blocks parents from viewing other students.
═══════════════════════════════════════════════════════════════════════ */

/**
 * GET /api/results/student/:studentId?term=&session=
 * All results for a student, optionally filtered by term/session.
 * Used by the Performance view (all terms) and the Report Card view.
 */
router.get('/student/:studentId',
  parentAuth, requireOwnStudent,
  rc.getStudentResults
);

/**
 * GET /api/results/report-card/:studentId?term=&session=
 * Full report card: results + remarks + domain assessments + position.
 * This is the primary endpoint for the parent Report Card view.
 */
router.get('/report-card/:studentId',
  parentAuth, requireOwnStudent,
  rc.getReportCard
);

/**
 * GET /api/results/remarks/:studentId?term=&session=
 * Teacher and principal remarks only.
 */
router.get('/remarks/:studentId',
  parentAuth, requireOwnStudent,
  rc.getRemarks
);

/* ═══════════════════════════════════════════════════════════════════════
   STAFF-ONLY routes
═══════════════════════════════════════════════════════════════════════ */

router.get('/class',          authenticate, staffOnly, rc.getClassResults);
router.get('/class-summary',  authenticate, staffOnly, rc.getClassSummary);
router.get('/export',         authenticate, staffOnly, rc.exportResults);

// Upsert single / bulk results
router.post('/',              authenticate, staffOnly, rc.upsert);
router.post('/bulk',          authenticate, staffOnly, rc.bulkUpsert);

// Remarks
router.post('/remarks',       authenticate, staffOnly, rc.saveRemarks);

// Domain assessments
router.get('/domains/:studentId',  authenticate, staffOnly, rc.getDomains);
router.post('/domains',            authenticate, staffOnly, rc.saveDomains);

// Single result CRUD
router.get('/:id',            authenticate, rc.getOne);
router.put('/:id',            authenticate, staffOnly, rc.update);
router.delete('/:id',         authenticate, adminOnly, rc.remove);

module.exports = router;