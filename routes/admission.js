'use strict';

const express               = require('express');
const admissionController   = require('../controllers/admissionController');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

/* ── Named / aggregate routes — before /:id ────────────────────────────── */

// GET  /api/admissions/stats?session=
router.get('/stats',           authorize('Admin'),            admissionController.getStats);

// GET  /api/admissions/export?status=&session=&format=csv
router.get('/export',          authorize('Admin'),            admissionController.exportAdmissions);

// POST /api/admissions/bulk-enroll   body: { enrollments: [{admission_id, class_id, arm}] }
router.post('/bulk-enroll',    authorize('Admin'),            admissionController.bulkEnroll);

/* ── Collection CRUD ────────────────────────────────────────────────────── */

// GET  /api/admissions?status=&session=&applyingForClass=&search=&page=&limit=
router.get('/',                authorize('Admin', 'Teacher'), admissionController.getAll);

// POST /api/admissions   body: all regForm.html fields
router.post('/',               authorize('Admin'),            admissionController.create);

/* ── Per-record operations — /:id last ─────────────────────────────────── */

// GET  /api/admissions/:id
router.get('/:id',             authorize('Admin', 'Teacher'), admissionController.getOne);

// PUT  /api/admissions/:id   general update (Pending/Draft only)
router.put('/:id',             authorize('Admin'),            admissionController.update);

// PATCH /api/admissions/:id/approve   body: { assignedClass, assignedArm, notes? }
router.patch('/:id/approve',   authorize('Admin'),            admissionController.approve);

// PATCH /api/admissions/:id/reject    body: { notes? }
router.patch('/:id/reject',    authorize('Admin'),            admissionController.reject);

// POST  /api/admissions/:id/enroll    body: { class_id?, arm?, studentId? }
router.post('/:id/enroll',     authorize('Admin'),            admissionController.enroll);

// POST  /api/admissions/:id/photo     multipart/form-data
router.post('/:id/photo',      authorize('Admin'),            admissionController.uploadPhoto);

// DELETE /api/admissions/:id
router.delete('/:id',          authorize('Admin'),            admissionController.remove);

module.exports = router;