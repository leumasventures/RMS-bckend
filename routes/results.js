'use strict';

const express = require('express');
const rc      = require('../controllers/resultsController');
const rc2     = require('../controllers/resultController');
const { authenticate, authorize, teacherScope } = require('../middleware/auth');
const { parentAuth, requireOwnStudent }         = require('../middleware/parentAuth');

const router    = express.Router();
const adminOnly = authorize('Admin');
const staffOnly = authorize('Admin', 'Teacher');
const scoped    = [authenticate, staffOnly, teacherScope];

/* ── parent + staff read ─────────────────────────────────────────────── */
router.get('/student/:studentId',     parentAuth, requireOwnStudent, rc.getStudentResults);
router.get('/report-card/:studentId', parentAuth, requireOwnStudent, rc.getReportCard);
router.get('/remarks/:studentId',     parentAuth, requireOwnStudent, rc.getRemarks);

/* ── allocations ─────────────────────────────────────────────────────── */
router.get('/allocations/class/:class/:arm',    ...scoped, rc2.getClassAllocation);
router.post('/allocations/class/:class/:arm',   ...scoped, rc2.setClassAllocation);
router.delete('/allocations/class/:class/:arm', authenticate, adminOnly, rc2.clearClassAllocation);
router.get('/allocations/student/:studentId',   ...scoped, rc2.getStudentAllocation);
router.post('/allocations/student/:studentId',  ...scoped, rc2.setStudentAllocation);
router.post('/allocations/student/bulk',        ...scoped, rc2.bulkSetStudentAllocations);

/* ── collection + class views ────────────────────────────────────────── */
router.get('/',              ...scoped, rc2.getAll);
router.get('/class',         ...scoped, rc.getClassResults);
router.get('/class-summary', ...scoped, rc.getClassSummary);
router.get('/export',        ...scoped, rc.exportResults);
router.get('/stats',         ...scoped, rc2.getStats);

/* ── domains ─────────────────────────────────────────────────────────── */
router.get('/domains/:studentId',  ...scoped, rc.getDomains);
router.post('/domains',            ...scoped, rc.saveDomains);

/* ── remarks ─────────────────────────────────────────────────────────── */
router.post('/remarks', ...scoped, rc.saveRemarks);

/* ── upsert / bulk ───────────────────────────────────────────────────── */
router.post('/',     ...scoped, rc.upsert);
router.post('/bulk', ...scoped, rc.bulkUpsert);

/* ── single result CRUD (/:id must be last) ──────────────────────────── */
router.get('/:id',    authenticate, rc2.getOne);
router.put('/:id',    ...scoped, rc2.update);
router.delete('/:id', authenticate, adminOnly, rc2.remove);

module.exports = router;
