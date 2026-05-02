'use strict';

const express           = require('express');
const subjectController = require('../controllers/subjectController');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

// All subject routes require authentication
router.use(authenticate);

/* ── Read (any authenticated user) ─────────────────────────────────────────── */

// GET /api/subjects?level=&type=&code=
router.get('/',    subjectController.getAll);

// GET /api/subjects/:id
router.get('/:id', subjectController.getOne);

/* ── Write (Admin only) ─────────────────────────────────────────────────────── */

// POST /api/subjects   body: { name, code, level, type }
router.post('/',    authorize('Admin'), subjectController.create);

// DELETE /api/subjects/:id
router.delete('/:id', authorize('Admin'), subjectController.remove);

module.exports = router;