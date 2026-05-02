'use strict';

const express          = require('express');
const resultController = require('../controllers/resultController');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

// All result routes require authentication
router.use(authenticate);

/* ── Aggregate / special routes (must come before /:id) ─────────────────────
   Order matters: Express matches routes top-to-bottom.
   /stats, /report-card/:studentId and /allocations/* would be shadowed
   by /:id if placed after it.
   ─────────────────────────────────────────────────────────────────────────── */

// GET /api/results/stats?class=&arm=&term=&session=
router.get('/stats', resultController.getStats);

// GET /api/results/report-card/:studentId?term=&session=
router.get('/report-card/:studentId', resultController.getReportCard);

/* ── Subject Allocation routes ───────────────────────────────────────────────
   Class-level  (applies to all students in a class/arm, JSS and non-SS2/3)
   Student-level (per-student overrides for SS2/SS3 — max 9 subjects)
   ─────────────────────────────────────────────────────────────────────────── */

// GET    /api/results/allocations/class/:class/:arm
router.get(
  '/allocations/class/:class/:arm',
  resultController.getClassAllocation
);

// PUT    /api/results/allocations/class/:class/:arm   body: { subjects[] }
router.put(
  '/allocations/class/:class/:arm',
  authorize('Admin', 'Teacher'),
  resultController.setClassAllocation
);

// DELETE /api/results/allocations/class/:class/:arm
router.delete(
  '/allocations/class/:class/:arm',
  authorize('Admin'),
  resultController.clearClassAllocation
);

// GET    /api/results/allocations/student/:studentId
router.get(
  '/allocations/student/:studentId',
  resultController.getStudentAllocation
);

// PUT    /api/results/allocations/student/:studentId  body: { subjects[] }
router.put(
  '/allocations/student/:studentId',
  authorize('Admin', 'Teacher'),
  resultController.setStudentAllocation
);

// POST   /api/results/allocations/bulk-student  body: { class, arm, subjects[] }
// Applies the same list to every student in an SS2/SS3 class/arm
router.post(
  '/allocations/bulk-student',
  authorize('Admin', 'Teacher'),
  resultController.bulkSetStudentAllocations
);

/* ── Core result CRUD ────────────────────────────────────────────────────── */

// GET /api/results?studentId=&class=&arm=&subject=&term=&session=
router.get('/', resultController.getAll);

// GET /api/results/:id
router.get('/:id', resultController.getOne);

// POST /api/results/bulk   body: { class, arm, term, session, rows[] }
router.post('/bulk', authorize('Admin', 'Teacher'), resultController.bulkCreate);

// POST /api/results        body: { studentId, class, arm, subject, term, session, ca, exam }
router.post('/', authorize('Admin', 'Teacher'), resultController.create);

// PUT /api/results/:id     body: { ca?, exam? }
router.put('/:id', authorize('Admin', 'Teacher'), resultController.update);

// DELETE /api/results/:id
router.delete('/:id', authorize('Admin'), resultController.remove);

module.exports = router;