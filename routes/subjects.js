'use strict';

const express           = require('express');
const subjectController = require('../controllers/subjectController');
const { authenticate, authorize } = require('../middleware/auth');

const router    = express.Router();
const adminOnly = authorize('Admin');

router.use(authenticate);

/* ── Collection CRUD ────────────────────────────────────────────────────── */

// GET  /api/subjects?level=&type=&code=&search=
router.get('/',    subjectController.getAll);

// POST /api/subjects   body: { name, code, level?, type? }
router.post('/',   adminOnly, subjectController.create);

/* ── Per-record operations — /:id last ─────────────────────────────────── */

// GET    /api/subjects/:id   (also accepts name or code)
router.get('/:id',    subjectController.getOne);

// PUT    /api/subjects/:id   body: { name?, code?, level?, type? }
router.put('/:id',    adminOnly, subjectController.update);

// DELETE /api/subjects/:id
router.delete('/:id', adminOnly, subjectController.remove);

module.exports = router;