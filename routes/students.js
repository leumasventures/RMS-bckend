'use strict';

const express  = require('express');
const ctrl     = require('../controllers/studentController');
const { authenticate, authorize } = require('../middleware/auth');

const router    = express.Router();
const adminOnly = authorize('Admin');
const staffOnly = authorize('Admin', 'Teacher');

router.options('*', (_req, res) => res.sendStatus(204));

/* ── Public: parent portal verification — no auth required ── */
router.get('/parent-verify/:id', (req, res) => {
  try {
    const db = require('../config/db');
    const student = db.findStudent(req.params.id);
    if (!student) return res.status(404).json({ success: false, message: 'Student not found.' });
    return res.json({ success: true, data: {
      id:           student.id,
      name:         student.name,
      class:        student.class || student.class_name || '',
      arm:          student.arm   || '',
      phone:        student.phone || student.parent_phone || '',
      parent_phone: student.parent_phone || student.phone || '',
    }});
  } catch(e) { return res.status(500).json({ success: false, message: e.message }); }
});

router.use(authenticate);

/* ── Named / aggregate routes — BEFORE /:id ────────────────────────────── */

// GET /api/students/export?class=&arm=
router.get('/export', adminOnly, ctrl.exportStudents);

// POST /api/students/bulk   body: { class, arm, students: [] }
// Must be before /:id so "bulk" isn't treated as a student id
router.post('/bulk', adminOnly, ctrl.bulkCreate);

/* ── Collection CRUD ────────────────────────────────────────────────────── */

// GET  /api/students?class=&arm=&gender=&search=&sortBy=&sortDir=&page=&limit=
router.get('/',  ctrl.getAll);

// POST /api/students   body: { id?, name, class, arm, gender, … }
router.post('/', adminOnly, ctrl.create);

/* ── Per-record operations — /:id last ─────────────────────────────────── */

// GET  /api/students/:id
router.get('/:id',              ctrl.getOne);

// GET  /api/students/:id/summary?term=&session=
router.get('/:id/summary',      staffOnly, ctrl.getSummary);

// GET  /api/students/:id/results?termId=&sessionId=
router.get('/:id/results',      ctrl.getResults);

// GET  /api/students/:id/attendance?termId=&sessionId=
router.get('/:id/attendance',   ctrl.getAttendance);

// GET  /api/students/:id/report-card?termId=
router.get('/:id/report-card',  ctrl.getReportCard);

// PUT    /api/students/:id
router.put('/:id',              adminOnly, ctrl.update);

// PATCH  /api/students/:id/transfer     body: { class, arm }
router.patch('/:id/transfer',   adminOnly, ctrl.transfer);

// PATCH  /api/students/:id/attendance   body: { attendance: 0-100 }
router.patch('/:id/attendance', staffOnly, ctrl.updateAttendance);

// PATCH  /api/students/:id/status       body: { status }
router.patch('/:id/status',     adminOnly, ctrl.setStatus);

// DELETE /api/students/:id
router.delete('/:id',           adminOnly, ctrl.remove);

module.exports = router;