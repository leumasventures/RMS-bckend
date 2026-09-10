'use strict';
/**
 * routes/students.js — Sacred Heart College
 *
 * Key changes vs original:
 *  • GET  /parent-verify/:id  — now hits MySQL properly (no db.findStudent)
 *  • POST /parent-login       — NEW: verifies phone → issues parent JWT (8 h)
 *  • GET  /:id                — accepts parent JWT via parentAuth
 *  • GET  /:id/results        — parent-accessible
 *  • GET  /:id/attendance     — parent-accessible
 *  • GET  /:id/report-card    — parent-accessible
 *  • All write operations still require staff JWT
 */

const express  = require('express');
const jwt      = require('jsonwebtoken');
const ctrl     = require('../controllers/studentController');
const { authenticate, authorize }       = require('../middleware/auth');
const { parentAuth, requireOwnStudent } = require('../middleware/parentAuth');

const router    = express.Router();
const adminOnly = authorize('Admin');
const staffOnly = authorize('Admin', 'Teacher');

const SECRET = process.env.JWT_PARENT_SECRET || process.env.JWT_ACCESS_SECRET;

router.options('*', (_req, res) => res.sendStatus(204));

/* ═══════════════════════════════════════════════════════════════════════
   PUBLIC ROUTES — no token required
   These are called by the parent login form before any session exists.
═══════════════════════════════════════════════════════════════════════ */

/**
 * GET /api/students/parent-verify/:id
 * Returns minimal public info to confirm a student exists.
 * Phone number is included so the existing frontend comparison still works,
 * but the /parent-login endpoint below is the preferred (secure) flow.
 */
router.get('/parent-verify/:id', async (req, res) => {
  try {
    const db = require('../config/db');
    const [[row]] = await db.pool.query(
      `SELECT s.id, s.name, c.name AS class_name, s.arm, s.phone
       FROM   students s
       LEFT JOIN classes c ON c.id = s.class_id
       WHERE  s.id = ? AND s.active = 1
       LIMIT  1`,
      [req.params.id]
    );
    if (!row) return res.status(404).json({ success: false, message: 'Student not found.' });

    return res.json({
      success: true,
      data: {
        id:         row.id,
        name:       row.name,
        class_name: row.class_name || '',
        class:      row.class_name || '',
        arm:        row.arm        || '',
        phone:      row.phone      || '',   // kept for legacy frontend check
        parent_phone: row.phone    || '',
      },
    });
  } catch (e) {
    console.error('[parent-verify]', e.message);
    return res.status(500).json({ success: false, message: e.message });
  }
});

/**
 * POST /api/students/parent-login
 * Body: { studentId, phone }
 *
 * 1. Looks up the student by ID
 * 2. Compares last-8-digits of phone (handles +234 / 0xxx variations)
 * 3. Issues a signed parent JWT valid for 8 hours
 *
 * The frontend stores this token in sessionStorage and sends it as
 * Authorization: Bearer <token> on every subsequent request.
 * parentAuth middleware validates it.
 */
router.post('/parent-login', async (req, res) => {
  try {
    const { studentId, phone } = req.body || {};
    if (!studentId || !phone) {
      return res.status(400).json({
        success: false,
        message: 'studentId and phone are required.',
      });
    }

    const db = require('../config/db');
    const [[student]] = await db.pool.query(
      `SELECT s.id, s.name, c.name AS class_name, s.arm, s.phone
       FROM   students s
       LEFT JOIN classes c ON c.id = s.class_id
       WHERE  s.id = ? AND s.active = 1
       LIMIT  1`,
      [studentId.trim().toUpperCase()]
    );

    if (!student) {
      return res.status(404).json({ success: false, message: 'Student not found.' });
    }

    // Normalise: strip spaces, replace +234 or 234 prefix with 0
    const norm  = p => (p || '').replace(/\s/g, '').replace(/^(\+234|234)/, '0');
    const stored  = norm(student.phone);
    const entered = norm(phone);

    if (!stored || entered.slice(-8) !== stored.slice(-8)) {
      return res.status(401).json({
        success: false,
        message: 'Phone number does not match our records. Please contact the school office.',
      });
    }

    // Issue parent JWT — 8 hour expiry
    const token = jwt.sign(
      { type: 'parent', studentId: student.id, name: student.name },
      SECRET,
      { expiresIn: '8h' }
    );

    return res.json({
      success: true,
      message: 'Login successful.',
      token,
      student: {
        id:         student.id,
        name:       student.name,
        class_name: student.class_name || '',
        class:      student.class_name || '',
        arm:        student.arm        || '',
      },
    });
  } catch (e) {
    console.error('[parent-login]', e.message);
    return res.status(500).json({ success: false, message: e.message });
  }
});

/* ═══════════════════════════════════════════════════════════════════════
   STAFF-ONLY routes
═══════════════════════════════════════════════════════════════════════ */
router.get('/export',  authenticate, adminOnly, ctrl.exportStudents);
router.post('/bulk',   authenticate, adminOnly, ctrl.bulkCreate);
router.get('/',        authenticate, ctrl.getAll);
router.post('/',       authenticate, adminOnly, ctrl.create);

/* ═══════════════════════════════════════════════════════════════════════
   PARENT + STAFF routes
   parentAuth accepts either token type.
   requireOwnStudent ensures parents only see their ward.
═══════════════════════════════════════════════════════════════════════ */

// Basic profile
router.get('/:id',
  parentAuth, requireOwnStudent,
  ctrl.getOne);

// Academic results (all terms)
router.get('/:id/results',
  parentAuth, requireOwnStudent,
  ctrl.getResults);

// Attendance log
router.get('/:id/attendance',
  parentAuth, requireOwnStudent,
  ctrl.getAttendance);

// Full report card (results + remarks + domains)
router.get('/:id/report-card',
  parentAuth, requireOwnStudent,
  ctrl.getReportCard);

// Staff-only detailed summary
router.get('/:id/summary',
  authenticate, staffOnly,
  ctrl.getSummary);

/* ── Staff-only mutations ── */
router.put('/:id',              authenticate, adminOnly, ctrl.update);
router.patch('/:id/transfer',   authenticate, adminOnly, ctrl.transfer);
router.patch('/:id/attendance', authenticate, staffOnly, ctrl.updateAttendance);
router.patch('/:id/status',     authenticate, adminOnly, ctrl.setStatus);
router.delete('/:id',           authenticate, adminOnly, ctrl.remove);

module.exports = router;