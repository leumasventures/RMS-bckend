'use strict';

const express              = require('express');
const attendanceController = require('../controllers/attendanceController');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

/* ── Named / aggregate routes — BEFORE /:id to avoid param capture ──────── */

// GET /api/attendance/school-days/:term
router.get('/school-days/:term', attendanceController.getSchoolDays);

// GET /api/attendance/class-summary?class=&arm=&term=&session=
router.get('/class-summary',     attendanceController.getClassSummary);

// GET /api/attendance/export?class=&arm=&term=&session=
router.get('/export',            authorize('Admin', 'Teacher'), attendanceController.exportAttendance);

// GET /api/attendance/domains?class=&arm=&term=&session=
router.get('/domains',           attendanceController.getClassDomains);

// PUT /api/attendance/domains/:studentId?term=&session=
// body: { cognitive?, affective?, psychomotor?, behavior_0?…behavior_7? }
router.put(
  '/domains/:studentId',
  authorize('Admin', 'Teacher'),
  attendanceController.setStudentDomains
);

// GET /api/attendance/summary/:studentId?term=&session=
router.get('/summary/:studentId', attendanceController.getSummary);

/* ── Bulk mark — before POST / ──────────────────────────────────────────── */

// POST /api/attendance/bulk   body: { class, arm, date, term, session, records[] }
router.post('/bulk', authorize('Admin', 'Teacher'), attendanceController.bulkMark);

/* ── Collection CRUD ────────────────────────────────────────────────────── */

// GET  /api/attendance?studentId=&class=&arm=&date=&term=&session=&status=
router.get('/',    attendanceController.getAll);

// POST /api/attendance   body: { studentId, class, arm, date, term, session, status }
router.post('/',   authorize('Admin', 'Teacher'), attendanceController.mark);

/* ── Per-record operations — /:id last ─────────────────────────────────── */

// PUT    /api/attendance/:id   body: { status?, remarks? }
router.put('/:id',    authorize('Admin', 'Teacher'), attendanceController.update);

// DELETE /api/attendance/:id
router.delete('/:id', authorize('Admin'),            attendanceController.remove);

module.exports = router;