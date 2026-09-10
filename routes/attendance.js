'use strict';
/**
 * routes/attendance.js — Sacred Heart College
 *
 * Key changes vs original:
 *  • GET /student/:studentId  — NEW parent-accessible endpoint (attendance log)
 *  • GET /summary/:studentId  — now accepts parent JWT too
 *  • All write / class-level routes still require staff JWT
 *
 * IMPORTANT: /student/:studentId and /summary/:studentId must come BEFORE
 * the generic /:id route to avoid Express treating the path segment as an ID.
 */

const express = require('express');
const ac      = require('../controllers/attendanceController');
const { authenticate, authorize }       = require('../middleware/auth');
const { parentAuth, requireOwnStudent } = require('../middleware/parentAuth');

const router    = express.Router();
const staffOnly = authorize('Admin', 'Teacher');
const adminOnly = authorize('Admin');

/* ═══════════════════════════════════════════════════════════════════════
   PARENT + STAFF read routes
═══════════════════════════════════════════════════════════════════════ */

/**
 * GET /api/attendance/student/:studentId?term=&session=&limit=
 * Returns the attendance log for a single student.
 * Parents can only access their own ward (requireOwnStudent).
 *
 * Delegates to the existing getAll controller by injecting the
 * studentId from the URL param into req.query.studentId.
 */
router.get('/student/:studentId',
  parentAuth, requireOwnStudent,
  (req, res) => {
    req.query.studentId = req.params.studentId;
    return ac.getAll(req, res);
  }
);

/**
 * GET /api/attendance/summary/:studentId?term=&session=
 * Present / absent / late counts + percentage.
 * Parents can access their own ward.
 */
router.get('/summary/:studentId',
  parentAuth, requireOwnStudent,
  ac.getSummary
);

/* ═══════════════════════════════════════════════════════════════════════
   STAFF-ONLY routes  (order matters — named routes before /:id)
═══════════════════════════════════════════════════════════════════════ */

router.get('/school-days/:term',   authenticate, ac.getSchoolDays);
router.get('/class-summary',       authenticate, ac.getClassSummary);
router.get('/export',              authenticate, authorize('Admin', 'Teacher'), ac.exportAttendance);
router.get('/domains',             authenticate, ac.getClassDomains);

router.put('/domains/:studentId',  authenticate, staffOnly, ac.setStudentDomains);

router.post('/bulk',               authenticate, staffOnly, ac.bulkMark);

// Collection (staff read + mark)
router.get('/',    authenticate, ac.getAll);
router.post('/',   authenticate, staffOnly, ac.mark);

// Per-record (must come last to avoid capturing named segments above)
router.put('/:id',    authenticate, staffOnly, ac.update);
router.delete('/:id', authenticate, adminOnly, ac.remove);

module.exports = router;