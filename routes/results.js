'use strict';

const express = require('express');
// CRITICAL FIX: Ensure both point to your updated controller file to prevent method fragmentation
const rc = require('../controllers/resultController'); 
const rc2 = require('../controllers/resultController'); 

const { authenticate, authorize, teacherScope } = require('../middleware/auth');
const { parentAuth, requireOwnStudent } = require('../middleware/parentAuth');

const router = express.Router();

const adminOnly = authorize('Admin');
const staffOnly = authorize('Admin', 'Teacher');
const scoped = [authenticate, staffOnly, teacherScope];

/* ── parent + staff read ─────────────────────────────────────────────── */
router.get('/student/:studentId', parentAuth, requireOwnStudent, rc.getStudentResults);
router.get('/report-card/:studentId', parentAuth, requireOwnStudent, rc.getReportCard);
router.get('/remarks/:studentId', parentAuth, requireOwnStudent, rc.getRemarks);

/* ── allocations — query-param routes (fixes %20 space in class names) ── */
router.get('/allocations/class', ...scoped, rc2.getClassAllocation);
router.post('/allocations/class', ...scoped, rc2.setClassAllocation);
router.put('/allocations/class', ...scoped, rc2.setClassAllocation);
router.delete('/allocations/class', authenticate, adminOnly, rc2.clearClassAllocation);

// Keep path-param aliases for backward compat
router.get('/allocations/class/:cls/:arm', ...scoped, rc2.getClassAllocation);
router.post('/allocations/class/:cls/:arm', ...scoped, rc2.setClassAllocation);
router.put('/allocations/class/:cls/:arm', ...scoped, rc2.setClassAllocation);
router.delete('/allocations/class/:cls/:arm', authenticate, adminOnly, rc2.clearClassAllocation);

router.get('/allocations/student/:studentId', ...scoped, rc2.getStudentAllocation);
router.post('/allocations/student/:studentId', ...scoped, rc2.setStudentAllocation);
router.put('/allocations/student/:studentId', ...scoped, rc2.setStudentAllocation); 
router.post('/allocations/student/bulk', ...scoped, rc2.bulkSetStudentAllocations);
router.post('/allocations/bulk-student', ...scoped, rc2.bulkSetStudentAllocations); 

/* ── collection + class views ────────────────────────────────────────── */
router.get('/', ...scoped, rc2.getAll);
router.get('/class', ...scoped, rc.getClassResults);
router.get('/class-summary', ...scoped, rc.getClassSummary);
router.get('/export', ...scoped, rc.exportResults);
router.get('/stats', ...scoped, rc2.getStats);

/* ── domains ─────────────────────────────────────────────────────────── */
router.get('/domains/:studentId', ...scoped, rc.getDomains);
router.post('/domains', ...scoped, rc.saveDomains);

/* ── remarks ─────────────────────────────────────────────────────────── */
router.post('/remarks', ...scoped, rc.saveRemarks);

/* ── upsert / bulk ───────────────────────────────────────────────────── */
// CRITICAL FIX: Explicitly mapped both endpoints to use the same controller object
router.post('/', ...scoped, rc.upsert);
router.post('/bulk', ...scoped, rc.bulkUpsert);

/* ── single result CRUD (/:id must be last) ──────────────────────────── */
// CRITICAL FIX: Swapped rc2.update/remove with rc.update/remove to route directly to your core CRUD handlers
router.get('/:id', authenticate, rc.getOne);
router.put('/:id', ...scoped, rc.update);
router.delete('/:id', authenticate, adminOnly, rc.remove);

module.exports = router;
