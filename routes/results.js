'use strict';
/**
 * routes/results.js — Sacred Heart College
 *
 * FIXES:
 *  • class-allocation routes use query params (?class=&arm=) not URL params
 *  • requireTeacherClass injects class/arm for all GET routes
 *  • parent-accessible routes use parentAuth + requireOwnStudent
 */

const express = require('express');
const rc  = require('../controllers/resultController');
const rcc = require('../controllers/reportCardController');
const crc = require('../controllers/checkResultController');
const { authenticate, authorize }       = require('../middleware/auth');
const { parentAuth, requireOwnStudent } = require('../middleware/parentAuth');

const router    = express.Router();
const adminOnly = authorize('Admin');
const staffOnly = authorize('Admin', 'Teacher');

/* Force teacher's class/arm into query for class-scoped GET routes */
function requireTeacherClass(req, _res, next) {
  if (req.user?.role === 'Teacher') {
    if (req.user.assignedClass) req.query.class = req.user.assignedClass;
    if (req.user.assignedArm)   req.query.arm   = req.user.assignedArm;
  }
  next();
}

/* ── PARENT + STAFF read routes ── */
router.get('/student/:studentId',       parentAuth, requireOwnStudent, crc.getResultSheet);
router.get('/report-card/:studentId',   parentAuth, requireOwnStudent, crc.getReportCard);
router.get('/available-terms/:studentId', parentAuth, requireOwnStudent, crc.getAvailableTerms);
router.get('/term-trend/:studentId',    parentAuth, requireOwnStudent, crc.getTermTrend);

/* ── STAFF-ONLY routes ── */
// Class-level queries — teachers scoped to their class
router.get('/class',          authenticate, staffOnly, requireTeacherClass, rc.getAll);
router.get('/class-summary',  authenticate, staffOnly, requireTeacherClass, rcc.classSummary);
router.get('/stats',          authenticate, staffOnly, requireTeacherClass, rc.getStats);

// Report card generation
router.get('/generate',        authenticate, staffOnly, requireTeacherClass, rcc.generate);
router.get('/cumulative',      authenticate, staffOnly, requireTeacherClass, rcc.getCumulative);
router.get('/student-cumulative/:studentId', authenticate, staffOnly, rcc.getStudentCumulative);

// Remarks & domains
router.post('/remark',         authenticate, staffOnly, rcc.saveRemark);
router.get('/domains',         authenticate, staffOnly, requireTeacherClass, rcc.getDomains);
router.post('/domains',        authenticate, staffOnly, rcc.setDomains);

// Subject allocations — FIX: all use query params (?class=&arm=)
router.get('/class-allocation',        authenticate, rc.getClassAllocation);
router.post('/class-allocation',       authenticate, staffOnly, rc.setClassAllocation);
router.delete('/class-allocation',     authenticate, adminOnly, rc.clearClassAllocation);
router.get('/allocations',             authenticate, rc.getAllocations);
router.get('/student-allocation/:studentId', authenticate, staffOnly, rc.getStudentAllocation);
router.post('/student-allocation',     authenticate, staffOnly, rc.setStudentAllocation);
router.post('/student-allocation/bulk',authenticate, staffOnly, rc.bulkSetStudentAllocations);

// Check-result (staff analytics)
router.get('/class-comparison/:studentId', authenticate, staffOnly, crc.getClassComparison);
router.get('/subject-detail/:studentId',   authenticate, staffOnly, crc.getSubjectDetail);
router.get('/all-assessments/:studentId',  authenticate, staffOnly, crc.getAllAssessments);

// CRUD
router.get('/',       authenticate, requireTeacherClass, rc.getAll);
router.post('/',      authenticate, staffOnly, rc.create);
router.post('/bulk',  authenticate, staffOnly, rc.bulkCreate);
router.get('/:id',    authenticate, rc.getOne);
router.put('/:id',    authenticate, staffOnly, rc.update);
router.delete('/:id', authenticate, adminOnly, rc.remove);

module.exports = router;