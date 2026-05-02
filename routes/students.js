'use strict';

/**
 * studentRoutes.js — Sacred Heart College Eziukwu Aba (SAHARCO)
 * ──────────────────────────────────────────────────────────────────
 * Mount at: /api/students
 *
 * GET    /                      Admin, Teacher (scoped), Parent (ward only)
 * GET    /:id                   Admin, Teacher (scoped), Parent (ward only)
 * GET    /:id/summary           Admin, Teacher (scoped)
 * POST   /                      Admin only
 * POST   /bulk                  Admin only
 * PUT    /:id                   Admin only
 * PATCH  /:id/transfer          Admin only
 * PATCH  /:id/attendance        Admin, Teacher (own class only)
 * DELETE /:id                   Admin only
 *
 * Note: /bulk must be declared BEFORE /:id so Express doesn't
 * treat "bulk" as a student ID.
 */

const express   = require('express');
const ctrl      = require('../controllers/studentController');
const { authenticate, authorize } = require('../middleware/auth');

const router     = express.Router();
const adminOnly  = authorize('Admin');
const staffOnly  = authorize('Admin', 'Teacher');

// All student routes require authentication
router.use(authenticate);

// ── Read ──────────────────────────────────────────────────────────────────────
router.get('/',           ctrl.getAll);
router.get('/:id',        ctrl.getOne);
router.get('/:id/summary', staffOnly, ctrl.getSummary);

// ── Write (Admin only) ────────────────────────────────────────────────────────
router.post('/bulk',      adminOnly, ctrl.bulkCreate);   // before /:id
router.post('/',          adminOnly, ctrl.create);
router.put ('/:id',       adminOnly, ctrl.update);
router.delete('/:id',     adminOnly, ctrl.remove);

// ── Targeted patches ──────────────────────────────────────────────────────────
router.patch('/:id/transfer',   adminOnly, ctrl.transfer);
router.patch('/:id/attendance', staffOnly, ctrl.updateAttendance);

module.exports = router;