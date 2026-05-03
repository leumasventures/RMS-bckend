'use strict';

const express                  = require('express');
const notificationController   = require('../controllers/notificationController');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

/* ── Named routes — before /:id ─────────────────────────────────────────── */

// GET  /api/notifications/unread-count
// Lightweight badge endpoint — avoids fetching full list just for the count.
// Mirrors _updateNotificationBadge() which only needs the number.
router.get('/unread-count', notificationController.getUnreadCount);

// PATCH /api/notifications/read-all
// Mark every notification as read for the requesting user.
// Mirrors openNotificationsPanel() read loop.
router.patch('/read-all', notificationController.markAllRead);

// POST /api/notifications/system  — Admin only
// Runs the automatic system checks (low attendance, no results).
router.post('/system', authorize('Admin'), notificationController.runSystemChecks);

// DELETE /api/notifications  — Admin only
// Clears all notifications globally — mirrors clearAllNotifications().
router.delete('/', authorize('Admin'), notificationController.clearAll);

/* ── Collection read / write ────────────────────────────────────────────── */

// GET  /api/notifications?unreadOnly=&type=&limit=
// Returns notifications relevant to the requesting user (newest first).
router.get('/', notificationController.getAll);

// POST /api/notifications   body: { message, type?, audience?, targetId?, link? }
// Push a new notification. Mirrors pushNotification() from Admin contexts.
router.post('/', authorize('Admin'), notificationController.create);

/* ── Per-notification operations — /:id last ────────────────────────────── */

// PATCH  /api/notifications/:id/read
// Mark a single notification as read for the requesting user.
router.patch('/:id/read', notificationController.markRead);

// DELETE /api/notifications/:id  — Admin only
router.delete('/:id', authorize('Admin'), notificationController.remove);

module.exports = router;