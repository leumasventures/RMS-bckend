'use strict';

/**
 * notificationRoutes.js — Sacred Heart College (SAHARCO)
 * Mount at: /api/notifications
 */

const express                = require('express');
const notificationController = require('../controllers/notificationController');
const { authenticate, authorize } = require('../middleware/auth');

const router    = express.Router();
const adminOnly = authorize('Admin');

router.use(authenticate);

/* ── Named routes — BEFORE /:id ─────────────────────────────────────────── */

// GET  /api/notifications/unread-count
// Lightweight badge endpoint — just returns the count.
router.get('/unread-count', notificationController.getUnreadCount);

// PATCH /api/notifications/read-all
// Mark every notification as read for the requesting user.
router.patch('/read-all', notificationController.markAllRead);

// POST /api/notifications/system   Admin only
// Runs automatic system checks (low attendance, missing results, etc.).
router.post('/system', adminOnly, notificationController.runSystemChecks);

/* ── Collection ──────────────────────────────────────────────────────────── */

// GET  /api/notifications?unreadOnly=&type=&limit=
router.get('/',  notificationController.getAll);

// POST /api/notifications   body: { message, type?, audience?, targetId?, link? }
router.post('/', adminOnly, notificationController.create);

// DELETE /api/notifications   Admin only — clears all notifications globally
router.delete('/', adminOnly, notificationController.clearAll);

/* ── Per-record — /:id last ──────────────────────────────────────────────── */

// PATCH  /api/notifications/:id/read
router.patch('/:id/read', notificationController.markRead);

// DELETE /api/notifications/:id
router.delete('/:id', adminOnly, notificationController.remove);

module.exports = router;