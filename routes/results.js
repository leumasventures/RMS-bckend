'use strict';

/**
 * routes/results.js — Sacred Heart College
 * All result routes point to ONE controller: resultController.js
 */
const express = require('express');
const rc      = require('../controllers/resultController');
const { authenticate, authorize, teacherScope } = require('../middleware/auth');
const { parentAuth, requireOwnStudent }         = require('../middleware/parentAuth');

const router    = express.Router();
const adminOnly = authorize('Admin');
const staffOnly = authorize('Admin', 'Teacher');
const scoped    = [authenticate, staffOnly, teacherScope];

/* ── Parent + staff READ ─────────────────────────────────────────────── */
router.get('/student/:studentId',     parentAuth, requireOwnStudent, rc.getStudentResults);
router.get('/report-card/:studentId', parentAuth, requireOwnStudent, rc.getReportCard);
router.get('/remarks/:studentId',     parentAuth, requireOwnStudent, rc.getRemarks);

/* ── Subject Allocations ─────────────────────────────────────────────── */
// Query-param routes (?class=JSS%201&arm=A)
router.get   ('/allocations/class',         ...scoped, rc.getClassAllocation);
router.post  ('/allocations/class',         ...scoped, rc.setClassAllocation);
router.put   ('/allocations/class',         ...scoped, rc.setClassAllocation);
router.delete('/allocations/class',         authenticate, adminOnly, rc.clearClassAllocation);
// Path-param aliases (/allocations/class/JSS 1/A)
router.get   ('/allocations/class/:cls/:arm', ...scoped, rc.getClassAllocation);
router.post  ('/allocations/class/:cls/:arm', ...scoped, rc.setClassAllocation);
router.put   ('/allocations/class/:cls/:arm', ...scoped, rc.setClassAllocation);
router.delete('/allocations/class/:cls/:arm', authenticate, adminOnly, rc.clearClassAllocation);
// Student allocations
router.get ('/allocations/student/:studentId', ...scoped, rc.getStudentAllocation);
router.post('/allocations/student/:studentId', ...scoped, rc.setStudentAllocation);
router.put ('/allocations/student/:studentId', ...scoped, rc.setStudentAllocation);
// Bulk student allocation (both URL forms api.js uses)
router.post('/allocations/student/bulk', ...scoped, rc.bulkSetStudentAllocations);
router.post('/allocations/bulk-student', ...scoped, rc.bulkSetStudentAllocations);

/* ── Collection + class views ────────────────────────────────────────── */
router.get('/class',         ...scoped, rc.getClassResults);
router.get('/class-summary', ...scoped, rc.getClassSummary);
router.get('/export',        ...scoped, rc.exportResults);
router.get('/stats',         ...scoped, rc.getStats);
router.get('/',              ...scoped, rc.getAll);

/* ── Domains & Remarks ───────────────────────────────────────────────── */
router.get ('/domains/:studentId', ...scoped, rc.getDomains);
router.post('/domains',            ...scoped, rc.saveDomains);
router.post('/remarks',            ...scoped, rc.saveRemarks);

/* ── SAVE: single + bulk (the critical ones) ─────────────────────────── */
router.post('/',     ...scoped, rc.upsert);
router.post('/bulk', ...scoped, rc.bulkUpsert);

/* ── Single result CRUD — /:id must be LAST ──────────────────────────── */
router.get   ('/:id', authenticate, rc.getOne);
router.put   ('/:id', ...scoped,    rc.update);
router.delete('/:id', authenticate, adminOnly, rc.remove);

module.exports = router;