'use strict';

const express = require('express');
const rc      = require('../controllers/resultsController');
const rc2     = require('../controllers/resultController');
const { authenticate, authorize }       = require('../middleware/auth');
const { parentAuth, requireOwnStudent } = require('../middleware/parentAuth');

const router    = express.Router();
const adminOnly = authorize('Admin');
const staffOnly = authorize('Admin', 'Teacher');

/* ── parent + staff read ─────────────────────────────────────────────── */
router.get('/student/:studentId',   parentAuth, requireOwnStudent, rc.getStudentResults);
router.get('/report-card/:studentId', parentAuth, requireOwnStudent, rc.getReportCard);
router.get('/remarks/:studentId',   parentAuth, requireOwnStudent, rc.getRemarks);

/* ── allocations ─────────────────────────────────────────────────────── */
router.get('/allocations/class/:class/:arm',    authenticate, staffOnly, rc2.getClassAllocation);
router.post('/allocations/class/:class/:arm',   authenticate, staffOnly, rc2.setClassAllocation);
router.delete('/allocations/class/:class/:arm', authenticate, adminOnly, rc2.clearClassAllocation);
router.get('/allocations/student/:studentId',   authenticate, staffOnly, rc2.getStudentAllocation);
router.post('/allocations/student/:studentId',  authenticate, staffOnly, rc2.setStudentAllocation);
router.post('/allocations/student/bulk',        authenticate, staffOnly, rc2.bulkSetStudentAllocations);

/* ── staff-only ──────────────────────────────────────────────────────── */
router.get('/class',         authenticate, staffOnly, rc.getClassResults);
router.get('/class-summary', authenticate, staffOnly, rc.getClassSummary);
router.get('/export',        authenticate, staffOnly, rc.exportResults);
router.get('/stats',         authenticate, staffOnly, rc2.getStats);

/* ── upsert / bulk ───────────────────────────────────────────────────── */
router.post('/',     authenticate, staffOnly, rc.upsert);
router.post('/bulk', authenticate, staffOnly, rc.bulkUpsert);

/* ── remarks ─────────────────────────────────────────────────────────── */
router.post('/remarks', authenticate, staffOnly, rc.saveRemarks);

/* ── domains ─────────────────────────────────────────────────────────── */
router.get('/domains/:studentId',  authenticate, staffOnly, rc.getDomains);
router.post('/domains',            authenticate, staffOnly, rc.saveDomains);

/* ── single result CRUD ──────────────────────────────────────────────── */
router.get('/:id',    authenticate, rc.getOne);
router.put('/:id',    authenticate, staffOnly, rc.update);
router.delete('/:id', authenticate, adminOnly, rc.remove);

module.exports = router;
