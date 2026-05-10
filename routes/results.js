'use strict';

const express          = require('express');
const resultController = require('../controllers/resultController');
const { authenticate, authorize } = require('../middleware/auth');

const router    = express.Router();
const staffOnly = authorize('Admin', 'Teacher');

router.use(authenticate);

/* ── Named / aggregate routes — BEFORE /:id ────────────────────────────── */

// GET /api/results/stats?class=&arm=&term=&session=
router.get('/stats', resultController.getStats);

// GET /api/results/report-card/:studentId?term=&session=
router.get('/report-card/:studentId', resultController.getReportCard);

// GET    /api/results/allocations/class/:class/:arm
router.get('/allocations/class/:class/:arm', resultController.getClassAllocation);

// PUT    /api/results/allocations/class/:class/:arm   body: { subjects[] }
router.put('/allocations/class/:class/:arm', staffOnly, resultController.setClassAllocation);

// DELETE /api/results/allocations/class/:class/:arm
router.delete('/allocations/class/:class/:arm', authorize('Admin'), resultController.clearClassAllocation);

// GET    /api/results/allocations/student/:studentId
router.get('/allocations/student/:studentId', resultController.getStudentAllocation);

// PUT    /api/results/allocations/student/:studentId  body: { subjects[] }
router.put('/allocations/student/:studentId', staffOnly, resultController.setStudentAllocation);

// POST   /api/results/allocations/bulk-student  body: { class, arm, subjects[] }
router.post('/allocations/bulk-student', staffOnly, resultController.bulkSetStudentAllocations);

/* ── Collection CRUD ────────────────────────────────────────────────────── */

// GET /api/results?studentId=&class=&arm=&subject=&term=&session=
router.get('/', resultController.getAll);

// POST /api/results/bulk   body: { results[], class_id, subject_id, term_id, session_id }
router.post('/bulk', staffOnly, resultController.bulkCreate);

// POST /api/results        body: { studentId, subject, term, session, ca, exam }
router.post('/', staffOnly, resultController.create);

/* ── Per-record — /:id last ─────────────────────────────────────────────── */

// GET    /api/results/:id
router.get('/:id', resultController.getOne);

// PUT    /api/results/:id  body: { ca?, exam? }
router.put('/:id', staffOnly, resultController.update);

// DELETE /api/results/:id
router.delete('/:id', authorize('Admin'), resultController.remove);

module.exports = router;