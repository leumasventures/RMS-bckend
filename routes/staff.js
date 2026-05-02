'use strict';

const express          = require('express');
const staffController  = require('../controllers/staffController');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

// All staff routes require authentication
router.use(authenticate);

/* ── Read (any authenticated user) ─────────────────────────────────────────── */

// GET /api/staff?category=&status=&department=&subject=&classUnit=&search=
router.get('/',                                  staffController.getAll);

// GET /api/staff/:id
router.get('/:id',                               staffController.getOne);

// GET /api/staff/:id/students  (academic staff only)
router.get('/:id/students',                      staffController.getStudents);

/* ── Write (Admin only) ─────────────────────────────────────────────────────── */

// POST /api/staff
router.post('/',                authorize('Admin'), staffController.create);

// PUT /api/staff/:id  (full update)
router.put('/:id',              authorize('Admin'), staffController.update);

// PATCH /api/staff/:id/status     body: { status }
router.patch('/:id/status',     authorize('Admin'), staffController.updateStatus);

// PATCH /api/staff/:id/assign-class  body: { classUnit, arm }
router.patch('/:id/assign-class', authorize('Admin'), staffController.assignClass);

// POST /api/staff/:id/credentials  body: { credentials: [{name,size,type}] }
router.post('/:id/credentials', authorize('Admin'), staffController.addCredentials);

// DELETE /api/staff/:id/credentials/:credIndex
router.delete('/:id/credentials/:credIndex', authorize('Admin'), staffController.removeCredential);

// DELETE /api/staff/:id
router.delete('/:id',           authorize('Admin'), staffController.remove);

module.exports = router;