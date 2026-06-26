'use strict';

const express = require('express');
const rc = require('../controllers/resultController'); 

const { authenticate, authorize, teacherScope } = require('../middleware/auth');
const { parentAuth, requireOwnStudent } = require('../middleware/parentAuth');

const router = express.Router();

const adminOnly = authorize('Admin');
const staffOnly = authorize('Admin', 'Teacher');
const scoped = [authenticate, staffOnly, teacherScope];

/* ── parent + staff read ─────────────────────────────────────────────── */
router.get('/student/:studentId', parentAuth, requireOwnStudent, rc.getStudentResults || ((req, res) => res.status(501).json({ message: "Not implemented" })));
router.get('/report-card/:studentId', parentAuth, requireOwnStudent, rc.getReportCard || ((req, res) => res.status(501).json({ message: "Not implemented" })));

// FIX: Added inline safety callback fallback to prevent Express from crashing if the method is ever missing
router.get('/remarks/:studentId', parentAuth, requireOwnStudent, rc.getRemarks || ((req, res) => res.status(501).json({ message: "Remarks not implemented" })));

/* ── allocations ────────────────────────────────────────────────────── */
router.get('/allocations/class', ...scoped, rc.getClassAllocation || stub('getClassAllocation'));
router.post('/allocations/class', ...scoped, rc.setClassAllocation || stub('setClassAllocation'));
router.put('/allocations/class', ...scoped, rc.setClassAllocation || stub('setClassAllocation'));
router.delete('/allocations/class', authenticate, adminOnly, rc.clearClassAllocation || stub('clearClassAllocation'));

router.get('/allocations/class/:cls/:arm', ...scoped, rc.getClassAllocation || stub('getClassAllocation'));
router.post('/allocations/class/:cls/:arm', ...scoped, rc.setClassAllocation || stub('setClassAllocation'));
router.put('/allocations/class/:cls/:arm', ...scoped, rc.setClassAllocation || stub('setClassAllocation'));
router.delete('/allocations/class/:cls/:arm', authenticate, adminOnly, rc.clearClassAllocation || stub('clearClassAllocation'));

router.get('/allocations/student/:studentId', ...scoped, rc.getStudentAllocation || stub('getStudentAllocation'));
router.post('/allocations/student/:studentId', ...scoped, rc.setStudentAllocation || stub('setStudentAllocation'));
router.put('/allocations/student/:studentId', ...scoped, rc.setStudentAllocation || stub('setStudentAllocation')); 
router.post('/allocations/student/bulk', ...scoped, rc.bulkSetStudentAllocations || stub('bulkSetStudentAllocations'));
router.post('/allocations/bulk-student', ...scoped, rc.bulkSetStudentAllocations || stub('bulkSetStudentAllocations')); 

/* ── collection + class views ────────────────────────────────────────── */
router.get('/', ...scoped, rc.getAll || stub('getAll'));
router.get('/class', ...scoped, rc.getClassResults || stub('getClassResults'));
router.get('/class-summary', ...scoped, rc.getClassSummary || stub('getClassSummary'));
router.get('/export', ...scoped, rc.exportResults || stub('exportResults'));
router.get('/stats', ...scoped, rc.getStats || stub('getStats'));

/* ── domains ─────────────────────────────────────────────────────────── */
router.get('/domains/:studentId', ...scoped, rc.getDomains || stub('getDomains'));
router.post('/domains', ...scoped, rc.saveDomains || stub('saveDomains'));

/* ── remarks ─────────────────────────────────────────────────────────── */
router.post('/remarks', ...scoped, rc.saveRemarks || stub('saveRemarks'));

/* ── upsert / bulk ───────────────────────────────────────────────────── */
router.post('/', ...scoped, rc.upsert);
router.post('/bulk', ...scoped, rc.bulkUpsert);

/* ── single result CRUD (/:id must be last) ──────────────────────────── */
router.get('/:id', authenticate, rc.getOne || stub('getOne'));
router.put('/:id', ...scoped, rc.update || stub('update'));
router.delete('/:id', authenticate, adminOnly, rc.remove || stub('remove'));

// Helper function to safely stub out missing endpoints without crashing the router compilation
function stub(name) {
  return (req, res) => res.status(501).json({ ok: false, message: `${name} endpoint allocation handler missing inside controller.` });
}

module.exports = router;
