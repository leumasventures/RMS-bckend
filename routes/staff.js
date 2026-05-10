'use strict';

const express          = require('express');
const staffController  = require('../controllers/staffController');
const { authenticate, authorize } = require('../middleware/auth');

const router    = express.Router();
const adminOnly = authorize('Admin');

router.use(authenticate);

/* ── Named / aggregate routes — BEFORE /:id ────────────────────────────── */

// GET /api/staff/export?category=&status=
router.get('/export', adminOnly, staffController.exportStaff);

/* ── Collection CRUD ────────────────────────────────────────────────────── */

// GET  /api/staff?category=&status=&department=&subject=&classUnit=&search=
router.get('/',    staffController.getAll);

// POST /api/staff   body: { name, category, position, … }
router.post('/',   adminOnly, staffController.create);

/* ── Per-record operations — /:id last ─────────────────────────────────── */

// GET  /api/staff/:id
router.get('/:id',              staffController.getOne);

// GET  /api/staff/:id/students
router.get('/:id/students',     staffController.getStudents);

// PUT  /api/staff/:id   full update
router.put('/:id',              adminOnly, staffController.update);

// PATCH /api/staff/:id/status         body: { status }
router.patch('/:id/status',     adminOnly, staffController.updateStatus);

// PATCH /api/staff/:id/assign-class   body: { classUnit, arm }
router.patch('/:id/assign-class',  adminOnly, staffController.assignClass);

// PATCH /api/staff/:id/assign-subject body: { subject_id, class_id? }
router.patch('/:id/assign-subject', adminOnly, staffController.assignSubject);

// POST  /api/staff/:id/credentials    body: { credentials: [{name,size,type}] }
router.post('/:id/credentials',  adminOnly, staffController.addCredentials);

// DELETE /api/staff/:id/credentials/:credIndex
router.delete('/:id/credentials/:credIndex', adminOnly, staffController.removeCredential);

// DELETE /api/staff/:id
router.delete('/:id', adminOnly, staffController.remove);

module.exports = router;