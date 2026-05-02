'use strict';

const express              = require('express');
const attendanceController = require('../controllers/attendanceController');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

// All attendance routes require authentication
router.use(authenticate);

/* ── Named / aggregate routes — must come BEFORE /:id / /:studentId ─────────
   Express matches top-to-bottom; without this order "summary", "school-days",
   "class-summary", and "domains" would be swallowed as :id values.
   ─────────────────────────────────────────────────────────────────────────── */

// GET /api/attendance/school-days/:term
// Returns the list of weekday dates for a term.
// Mirrors ATT_TERM_DATES / attGetSchoolDays() in the frontend.
router.get('/school-days/:term', attendanceController.getSchoolDays);

// GET /api/attendance/class-summary?class=&arm=&term=&session=
// Returns per-student counts + class averages (Summary & Stats tab).
router.get('/class-summary', attendanceController.getClassSummary);

// GET /api/attendance/domains?class=&arm=&term=&session=
// Returns domain assessments for all students in a class/arm (Domain Assessment tab).
router.get('/domains', attendanceController.getClassDomains);

// GET /api/attendance/summary/:studentId?term=&session=
// Per-student attendance summary + full record list.
router.get('/summary/:studentId', attendanceController.getSummary);

/* ── Core attendance CRUD ────────────────────────────────────────────────── */

// GET /api/attendance?studentId=&class=&arm=&date=&term=&session=&status=
router.get('/', attendanceController.getAll);

// POST /api/attendance/bulk  body: { class, arm, date, term, session, records[] }
// Registers attendance for a full class in one request.
// Must precede POST / to avoid clashing.
router.post(
  '/bulk',
  authorize('Admin', 'Teacher'),
  attendanceController.bulkMark
);

// POST /api/attendance  body: { studentId, class, arm, date, term, session, status }
// Mark a single student. status: p/l/a/e or Present/Late/Absent/Excused.
router.post('/', authorize('Admin', 'Teacher'), attendanceController.mark);

// PUT /api/attendance/:id  body: { status?, remarks? }
router.put('/:id', authorize('Admin', 'Teacher'), attendanceController.update);

/* ── Domain assessment write ─────────────────────────────────────────────── */

// PUT /api/attendance/domains/:studentId?term=&session=
// Upserts domain / behaviour scores for one student.
// body: { cognitive?, affective?, psychomotor?, behavior_0? … behavior_7? }
// Mirrors attSaveDomain() which fires on every select change.
router.put(
  '/domains/:studentId',
  authorize('Admin', 'Teacher'),
  attendanceController.setStudentDomains
);

// DELETE /api/attendance/:id
router.delete('/:id', authorize('Admin'), attendanceController.remove);

module.exports = router;