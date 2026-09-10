'use strict';

const db = require('../config/db');

/* ══════════════════════════════════════════════════════════════════════════════
   CONSTANTS  —  mirrors type values used in pushNotification()
══════════════════════════════════════════════════════════════════════════════ */
const VALID_TYPES  = ['info', 'success', 'warning', 'error'];
const MAX_PER_USER = 200; // cap to prevent unbounded growth

/* ══════════════════════════════════════════════════════════════════════════════
   HELPERS
══════════════════════════════════════════════════════════════════════════════ */
function ensureStore() {
  if (!db.notifications) db.notifications = [];
  return db.notifications;
}

function nextId() {
  const n = db.notifications || [];
  return n.length ? Math.max(...n.map(x => x.id || 0)) + 1 : 1;
}

/**
 * Relative time label — mirrors _relativeTime() in script3.js.
 * Computed server-side so clients get a consistent value.
 */
function relativeTime(iso) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60)    return 'Just now';
  if (diff < 3600)  return Math.floor(diff / 60)    + 'm ago';
  if (diff < 86400) return Math.floor(diff / 3600)  + 'h ago';
  return               Math.floor(diff / 86400) + 'd ago';
}

/** Which users should receive a notification based on audience */
function resolveAudience(audience, targetId) {
  // audience: 'all' | 'admin' | 'teachers' | 'parents' | 'user:<id>'
  return { audience, targetId: targetId || null };
}

/* ══════════════════════════════════════════════════════════════════════════════
   GET /api/notifications
   Query: unreadOnly (bool), type, limit (default 50)
   Returns notifications for the requesting user.
   • Admin sees all global notifications.
   • Teacher/Parent see only their own + global broadcasts.
   Mirrors the panel rendered by openNotificationsPanel() — newest first.
══════════════════════════════════════════════════════════════════════════════ */
exports.getAll = (req, res) => {
  const { unreadOnly, type, limit = 50 } = req.query;
  const all = ensureStore();

  // Filter to notifications relevant to this user
  let list = all.filter(n => {
    if (n.audience === 'all')   return true;
    if (n.audience === 'admin'    && req.user.role === 'Admin')   return true;
    if (n.audience === 'teachers' && req.user.role === 'Teacher') return true;
    if (n.audience === 'parents'  && req.user.role === 'Parent')  return true;
    if (n.targetId === req.user.id) return true;
    return false;
  });

  if (unreadOnly === 'true') list = list.filter(n => !n.readBy?.includes(req.user.id));
  if (type)                  list = list.filter(n => n.type === type);

  // Mark as read for this user
  list.forEach(n => {
    if (!n.readBy) n.readBy = [];
    if (!n.readBy.includes(req.user.id)) n.readBy.push(req.user.id);
  });

  const sliced = list.slice(0, Number(limit)).map(n => ({
    ...n,
    read:         n.readBy?.includes(req.user.id) ?? false,
    relativeTime: relativeTime(n.time),
  }));

  const unreadCount = all.filter(n => !(n.readBy || []).includes(req.user.id)).length;

  return res.json({ success: true, data: sliced, total: sliced.length, unreadCount });
};

/* ══════════════════════════════════════════════════════════════════════════════
   GET /api/notifications/unread-count
   Lightweight badge endpoint — avoids fetching full notification list.
   Mirrors _updateNotificationBadge() which only needs the count.
══════════════════════════════════════════════════════════════════════════════ */
exports.getUnreadCount = (req, res) => {
  const all = ensureStore();
  const count = all.filter(n => {
    const isForUser =
      n.audience === 'all' ||
      (n.audience === 'admin'    && req.user.role === 'Admin')   ||
      (n.audience === 'teachers' && req.user.role === 'Teacher') ||
      (n.audience === 'parents'  && req.user.role === 'Parent')  ||
      n.targetId === req.user.id;
    return isForUser && !(n.readBy || []).includes(req.user.id);
  }).length;

  return res.json({ success: true, unreadCount: count });
};

/* ══════════════════════════════════════════════════════════════════════════════
   POST /api/notifications  —  Admin only
   Body: { message*, type?, audience?, targetId?, link? }
   Mirrors pushNotification() which is called from Admin contexts.
   audience: 'all' | 'admin' | 'teachers' | 'parents' | 'user' (requires targetId)
══════════════════════════════════════════════════════════════════════════════ */
exports.create = (req, res) => {
  const { message, type = 'info', audience = 'all', targetId, link = '' } = req.body;

  if (!message || !String(message).trim())
    return res.status(400).json({ success: false, message: 'message is required.' });

  if (!VALID_TYPES.includes(type))
    return res.status(400).json({ success: false, message: `type must be one of: ${VALID_TYPES.join(', ')}.` });

  const validAudiences = ['all', 'admin', 'teachers', 'parents', 'user'];
  if (!validAudiences.includes(audience))
    return res.status(400).json({ success: false, message: `audience must be one of: ${validAudiences.join(', ')}.` });

  if (audience === 'user' && !targetId)
    return res.status(400).json({ success: false, message: 'targetId is required when audience is "user".' });

  const notifications = ensureStore();

  // Enforce cap
  if (notifications.length >= MAX_PER_USER * 10) notifications.splice(0, 100);

  const record = {
    id:        nextId(),
    message:   String(message).trim(),
    type,
    link,
    ...resolveAudience(audience, targetId),
    time:      new Date().toISOString(),
    readBy:    [],
    createdBy: req.user.name || req.user.id || 'System',
  };

  notifications.unshift(record); // newest first, matches the frontend's unshift()
  return res.status(201).json({ success: true, data: { ...record, relativeTime: 'Just now' } });
};

/* ══════════════════════════════════════════════════════════════════════════════
   PATCH /api/notifications/:id/read
   Mark a single notification as read for the requesting user.
══════════════════════════════════════════════════════════════════════════════ */
exports.markRead = (req, res) => {
  const id  = Number(req.params.id);
  const all = ensureStore();
  const n   = all.find(x => x.id === id);

  if (!n)
    return res.status(404).json({ success: false, message: `Notification ${id} not found.` });

  if (!n.readBy) n.readBy = [];
  if (!n.readBy.includes(req.user.id)) n.readBy.push(req.user.id);

  return res.json({ success: true, data: { ...n, read: true } });
};

/* ══════════════════════════════════════════════════════════════════════════════
   PATCH /api/notifications/read-all
   Mark all notifications as read for the requesting user.
   Mirrors the read loop inside openNotificationsPanel():
     notifications.forEach(n => n.read = true)
══════════════════════════════════════════════════════════════════════════════ */
exports.markAllRead = (req, res) => {
  const all = ensureStore();
  let   count = 0;

  all.forEach(n => {
    if (!n.readBy) n.readBy = [];
    if (!n.readBy.includes(req.user.id)) {
      n.readBy.push(req.user.id);
      count++;
    }
  });

  return res.json({ success: true, message: `${count} notification(s) marked as read.`, markedRead: count });
};

/* ══════════════════════════════════════════════════════════════════════════════
   DELETE /api/notifications  —  Admin only
   Clears ALL notifications globally.
   Mirrors clearAllNotifications(): App.data.notifications = []
══════════════════════════════════════════════════════════════════════════════ */
exports.clearAll = (req, res) => {
  db.notifications = [];
  return res.json({ success: true, message: 'All notifications cleared.' });
};

/* ══════════════════════════════════════════════════════════════════════════════
   DELETE /api/notifications/:id  —  Admin only
   Delete a single notification record.
══════════════════════════════════════════════════════════════════════════════ */
exports.remove = (req, res) => {
  const id  = Number(req.params.id);
  const all = ensureStore();
  const idx = all.findIndex(n => n.id === id);

  if (idx < 0)
    return res.status(404).json({ success: false, message: `Notification ${id} not found.` });

  const [removed] = all.splice(idx, 1);
  return res.json({ success: true, message: 'Notification deleted.', data: removed });
};

/* ══════════════════════════════════════════════════════════════════════════════
   POST /api/notifications/system  —  Admin only
   Trigger the automatic system checks that script3.js runs on DOMContentLoaded:
     • Students below 75% attendance
     • No results recorded yet
   Returns the notifications that were generated.
══════════════════════════════════════════════════════════════════════════════ */
exports.runSystemChecks = (req, res) => {
  const notifications = ensureStore();
  const created       = [];
  const createdBy     = req.user.name || 'System';

  // Attendance alert — mirrors "lowAtt > 0" check
  const lowAtt = (db.students || []).filter(s => (s.attendance ?? 100) < 75).length;
  if (lowAtt > 0) {
    const n = {
      id:        nextId(),
      message:   `${lowAtt} student(s) have attendance below 75%.`,
      type:      'warning',
      link:      '',
      audience:  'all',
      targetId:  null,
      time:      new Date().toISOString(),
      readBy:    [],
      createdBy,
    };
    notifications.unshift(n);
    created.push(n);
  }

  // No results alert — mirrors "no results recorded" check
  if (!(db.results || []).length && (db.classes || []).length) {
    const n = {
      id:        nextId(),
      message:   'No results recorded yet. Start by entering results.',
      type:      'info',
      link:      '',
      audience:  'all',
      targetId:  null,
      time:      new Date().toISOString(),
      readBy:    [],
      createdBy,
    };
    notifications.unshift(n);
    created.push(n);
  }

  return res.json({
    success: true,
    message: `${created.length} system notification(s) generated.`,
    data:    created,
  });
};