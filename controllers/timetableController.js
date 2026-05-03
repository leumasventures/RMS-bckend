'use strict';

const db = require('../config/db');

/* ══════════════════════════════════════════════════════════════════════════════
   CONSTANTS  —  mirror frontend DAYS / PERIODS exactly
══════════════════════════════════════════════════════════════════════════════ */
const VALID_DAYS    = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const VALID_PERIODS = ['8:00', '9:00', '10:00', '11:00', '12:00', '13:00', '14:00'];

/* ══════════════════════════════════════════════════════════════════════════════
   HELPERS
══════════════════════════════════════════════════════════════════════════════ */
function ensureTimetable() {
  if (!db.timetable) db.timetable = {};
  return db.timetable;
}

function classKey(cls, arm) {
  return `${cls}_${arm}`;
}

function canManageClass(user, cls, arm) {
  if (user.role === 'Admin') return true;
  return user.role === 'Teacher' &&
    user.assignedClass === cls &&
    user.assignedArm   === arm;
}

/** Build a full empty grid of { day: { period: '' } } */
function emptyGrid() {
  const grid = {};
  VALID_DAYS.forEach(d => {
    grid[d] = {};
    VALID_PERIODS.forEach(p => { grid[d][p] = ''; });
  });
  return grid;
}

/** Return the stored grid merged over an empty base so every cell always exists */
function hydratedGrid(stored) {
  const base = emptyGrid();
  if (!stored) return base;
  VALID_DAYS.forEach(d => {
    if (stored[d]) {
      VALID_PERIODS.forEach(p => {
        if (stored[d][p]) base[d][p] = stored[d][p];
      });
    }
  });
  return base;
}

/* ══════════════════════════════════════════════════════════════════════════════
   GET /api/timetable
   Query: class*, arm*
   Returns the full timetable grid for a class/arm.
   Mirrors loadTimetable() — any authenticated user can view.
══════════════════════════════════════════════════════════════════════════════ */
exports.get = (req, res) => {
  const { class: cls, arm } = req.query;

  if (!cls || !arm)
    return res.status(400).json({ success: false, message: 'class and arm are required.' });

  const timetable = ensureTimetable();
  const key       = classKey(cls, arm);
  const grid      = hydratedGrid(timetable[key]);

  return res.json({
    success: true,
    class:   cls,
    arm,
    key,
    days:    VALID_DAYS,
    periods: VALID_PERIODS,
    data:    grid,
  });
};

/* ══════════════════════════════════════════════════════════════════════════════
   PUT /api/timetable  —  Admin or assigned Teacher
   Body: { class*, arm*, grid: { Monday: { '8:00': 'Mathematics', ... }, ... } }
   Replaces the entire timetable for a class/arm.
   Mirrors saveTimetable() which iterates all DAYS × PERIODS.
══════════════════════════════════════════════════════════════════════════════ */
exports.save = (req, res) => {
  const { class: cls, arm, grid } = req.body;

  if (!cls || !arm)
    return res.status(400).json({ success: false, message: 'class and arm are required.' });

  if (!canManageClass(req.user, cls, arm))
    return res.status(403).json({ success: false, message: 'You can only manage the timetable for your assigned class/arm.' });

  if (!grid || typeof grid !== 'object' || Array.isArray(grid))
    return res.status(400).json({ success: false, message: 'grid must be an object keyed by day name.' });

  // Validate day/period keys and subject names
  for (const day of Object.keys(grid)) {
    if (!VALID_DAYS.includes(day))
      return res.status(400).json({ success: false, message: `"${day}" is not a valid day. Expected: ${VALID_DAYS.join(', ')}.` });

    if (typeof grid[day] !== 'object' || Array.isArray(grid[day]))
      return res.status(400).json({ success: false, message: `grid.${day} must be an object keyed by period.` });

    for (const period of Object.keys(grid[day])) {
      if (!VALID_PERIODS.includes(period))
        return res.status(400).json({ success: false, message: `"${period}" is not a valid period. Expected: ${VALID_PERIODS.join(', ')}.` });
    }
  }

  // Strip blank entries, only store what has a subject
  const timetable = ensureTimetable();
  const key       = classKey(cls, arm);
  const cleaned   = {};

  VALID_DAYS.forEach(d => {
    cleaned[d] = {};
    VALID_PERIODS.forEach(p => {
      const val = grid[d]?.[p];
      if (val && String(val).trim()) cleaned[d][p] = String(val).trim();
    });
  });

  timetable[key] = cleaned;

  return res.json({
    success: true,
    class:   cls,
    arm,
    data:    hydratedGrid(cleaned),
  });
};

/* ══════════════════════════════════════════════════════════════════════════════
   PATCH /api/timetable/cell  —  Admin or assigned Teacher
   Body: { class*, arm*, day*, period*, subject }
   Updates a single cell — useful for incremental edits without sending the full grid.
   Mirrors the per-cell select onChange that saveTimetable() collects.
══════════════════════════════════════════════════════════════════════════════ */
exports.updateCell = (req, res) => {
  const { class: cls, arm, day, period, subject } = req.body;

  if (!cls || !arm || !day || !period)
    return res.status(400).json({ success: false, message: 'class, arm, day, and period are required.' });

  if (!VALID_DAYS.includes(day))
    return res.status(400).json({ success: false, message: `"${day}" is not a valid day.` });

  if (!VALID_PERIODS.includes(period))
    return res.status(400).json({ success: false, message: `"${period}" is not a valid period.` });

  if (!canManageClass(req.user, cls, arm))
    return res.status(403).json({ success: false, message: 'You can only manage the timetable for your assigned class/arm.' });

  const timetable = ensureTimetable();
  const key       = classKey(cls, arm);

  if (!timetable[key])                timetable[key]       = {};
  if (!timetable[key][day])           timetable[key][day]  = {};

  if (subject && String(subject).trim()) {
    timetable[key][day][period] = String(subject).trim();
  } else {
    delete timetable[key][day][period]; // clearing a cell
  }

  return res.json({
    success: true,
    class:   cls,
    arm,
    day,
    period,
    subject: timetable[key][day]?.[period] || '',
  });
};

/* ══════════════════════════════════════════════════════════════════════════════
   DELETE /api/timetable  —  Admin only
   Query: class*, arm*
   Clears the entire timetable for a class/arm.
══════════════════════════════════════════════════════════════════════════════ */
exports.clear = (req, res) => {
  const { class: cls, arm } = req.query;

  if (!cls || !arm)
    return res.status(400).json({ success: false, message: 'class and arm are required.' });

  const timetable = ensureTimetable();
  const key       = classKey(cls, arm);

  delete timetable[key];
  return res.json({ success: true, message: `Timetable cleared for ${cls} ${arm}.` });
};

/* ══════════════════════════════════════════════════════════════════════════════
   GET /api/timetable/all
   Returns timetables for every class/arm that has one.
   Admin only — useful for a school-wide view.
══════════════════════════════════════════════════════════════════════════════ */
exports.getAll = (req, res) => {
  const timetable = ensureTimetable();
  const data      = Object.entries(timetable).map(([key, grid]) => {
    const [cls, ...armParts] = key.split('_');
    return { key, class: cls, arm: armParts.join('_'), data: hydratedGrid(grid) };
  });

  return res.json({
    success:  true,
    days:     VALID_DAYS,
    periods:  VALID_PERIODS,
    total:    data.length,
    data,
  });
};

/* ══════════════════════════════════════════════════════════════════════════════
   GET /api/timetable/teacher/:teacherId
   Returns all slots where a specific teacher is assigned.
   Useful for clash detection and teacher-schedule views.
══════════════════════════════════════════════════════════════════════════════ */
exports.getTeacherSlots = (req, res) => {
  const { teacherId } = req.params;
  const teacher = (db.staff || db.teachers || []).find(t => t.id === teacherId);
  if (!teacher)
    return res.status(404).json({ success: false, message: `Teacher "${teacherId}" not found.` });

  const subjects = teacher.subject
    ? [teacher.subject]
    : (teacher.subjects || []);

  const timetable = ensureTimetable();
  const slots     = [];

  Object.entries(timetable).forEach(([key, grid]) => {
    const [cls, ...armParts] = key.split('_');
    const arm = armParts.join('_');
    VALID_DAYS.forEach(day => {
      VALID_PERIODS.forEach(period => {
        const subj = grid[day]?.[period];
        if (subj && subjects.includes(subj)) {
          slots.push({ class: cls, arm, day, period, subject: subj });
        }
      });
    });
  });

  return res.json({
    success: true,
    teacher: { id: teacher.id, name: teacher.name, subjects },
    slots,
    total:   slots.length,
  });
};