'use strict';

const express          = require('express');
const classController  = require('../controllers/classController');
const { authenticate, authorize } = require('../middleware/auth');

const router    = express.Router();
const adminOnly = authorize('Admin');
const staffOnly = authorize('Admin', 'Teacher');

router.use(authenticate);

/* ── Named sub-routes — BEFORE /:name to avoid param capture ───────────── */

// GET  /api/classes/:name/arms
router.get('/:name/arms',            staffOnly,  classController.getArms);

// POST /api/classes/:name/arms       body: { arm } or { arms: [] }
router.post('/:name/arms',           adminOnly,  classController.addArm);

// PATCH /api/classes/:name/arms/:arm  body: { new_name }
router.patch('/:name/arms/:arm',     adminOnly,  classController.renameArm);

// DELETE /api/classes/:name/arms/:arm
router.delete('/:name/arms/:arm',    adminOnly,  classController.deleteArm);

// GET  /api/classes/:name/students?arm=
router.get('/:name/students',        staffOnly,  classController.getStudents);

// GET  /api/classes/:name/summary?arm=&term=&session=
router.get('/:name/summary',         staffOnly,  classController.getSummary);

// PATCH /api/classes/:name/assign-teacher   body: { teacher_id, arm? }
router.patch('/:name/assign-teacher', adminOnly, classController.assignTeacher);

/* ── Collection CRUD ────────────────────────────────────────────────────── */

// GET  /api/classes?level=&search=
router.get('/',     staffOnly, classController.getAll);

// POST /api/classes   body: { name, level, arms[] }
router.post('/',    adminOnly, classController.create);

/* ── Per-record operations — /:name last ────────────────────────────────── */

// GET    /api/classes/:name
router.get('/:name',    staffOnly, classController.getOne);

// PUT    /api/classes/:name   body: { name?, level?, arms? }
router.put('/:name',    adminOnly, classController.update);

// DELETE /api/classes/:name
router.delete('/:name', adminOnly, classController.remove);

module.exports = router;