'use strict';

/**
 * classRoutes.js — Sacred Heart College Eziukwu Aba (SAHARCO)
 * ──────────────────────────────────────────────────────────────
 * Base path (mounted in app.js): /api/classes
 *
 * All routes require a valid session (authenticate).
 * Role rules are enforced inside each controller, but the route
 * layer adds a coarse guard so unauthorized roles never reach
 * controller logic at all.
 *
 *   GET  /api/classes                       → Admin, Teacher
 *   GET  /api/classes/:name                 → Admin, Teacher
 *   GET  /api/classes/:name/arms            → Admin, Teacher
 *   GET  /api/classes/:name/students        → Admin, Teacher
 *   GET  /api/classes/:name/summary         → Admin, Teacher
 */

const express          = require('express');
const classController  = require('../controllers/classController');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

// Every class route requires a valid session
router.use(authenticate);

// Students and Parents have no business browsing class data directly —
// their dashboards use student-scoped or parent-scoped endpoints instead.
router.use(authorize('Admin', 'Teacher'));

// ── Routes ────────────────────────────────────────────────────────────────────

// List all classes (supports ?level=Junior|Senior filter)
router.get('/', classController.getAll);

// Single class detail with per-arm student counts
router.get('/:name', classController.getOne);

// Arm list only — lightweight, used for cascading dropdowns
router.get('/:name/arms', classController.getArms);

// Students in a class/arm (?arm=A optional)
router.get('/:name/students', classController.getStudents);

// Attendance + result statistics for a class/arm/term/session
// ?arm=A&term=First&session=2024/2025
router.get('/:name/summary', classController.getSummary);

module.exports = router;