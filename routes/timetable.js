'use strict';

const express               = require('express');
const timetableController   = require('../controllers/timetableController');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

/* ── Named routes before param-based ones ───────────────────────────────── */

// GET  /api/timetable/all               — Admin only, all classes
router.get('/all', authorize('Admin'), timetableController.getAll);

// GET  /api/timetable/teacher/:teacherId — Admin / Teacher (own schedule)
router.get('/teacher/:teacherId', timetableController.getTeacherSlots);

// PATCH /api/timetable/cell
// body: { class, arm, day, period, subject }  — single-cell update
router.patch('/cell', authorize('Admin', 'Teacher'), timetableController.updateCell);

/* ── Primary CRUD ───────────────────────────────────────────────────────── */

// GET    /api/timetable?class=&arm=      — any authenticated user
router.get('/', timetableController.get);

// PUT    /api/timetable
// body: { class, arm, grid }  — replace full grid
router.put('/', authorize('Admin', 'Teacher'), timetableController.save);

// DELETE /api/timetable?class=&arm=      — Admin only
router.delete('/', authorize('Admin'), timetableController.clear);

module.exports = router;