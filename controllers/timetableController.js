'use strict';
const db = require('../config/db');

const VALID_DAYS    = ['Monday','Tuesday','Wednesday','Thursday','Friday'];
const VALID_PERIODS = ['8:00','9:00','10:00','11:00','12:00','13:00','14:00'];

const fail = (res, s, m) => res.status(s).json({ success: false, message: m });
const ok   = (res, data, meta = {}, s = 200) => res.status(s).json({ success: true, ...meta, data });

function classKey(cls, arm) { return `${cls}_${arm}`; }

function emptyGrid() {
  const g = {};
  VALID_DAYS.forEach(d => { g[d] = {}; VALID_PERIODS.forEach(p => { g[d][p] = ''; }); });
  return g;
}

function hydratedGrid(stored) {
  const base = emptyGrid();
  if (!stored) return base;
  const src = typeof stored === 'string' ? JSON.parse(stored) : stored;
  VALID_DAYS.forEach(d => {
    if (src[d]) VALID_PERIODS.forEach(p => { if (src[d][p]) base[d][p] = src[d][p]; });
  });
  return base;
}

function canManageClass(user, cls, arm) {
  if (user.role === 'Admin') return true;
  return user.role === 'Teacher' && user.assignedClass === cls && user.assignedArm === arm;
}

/* GET /api/timetable?class=&arm= */
exports.get = async (req, res) => {
  try {
    const { class: cls, arm } = req.query;
    if (!cls || !arm) return fail(res, 400, 'class and arm are required.');

    const row = await db.query1('SELECT grid FROM timetables WHERE class_key=?', [classKey(cls, arm)]);
    const grid = hydratedGrid(row?.grid || null);

    return ok(res, grid, { class: cls, arm, days: VALID_DAYS, periods: VALID_PERIODS });
  } catch (e) { return fail(res, 500, e.message); }
};

/* PUT /api/timetable — replace full grid */
exports.save = async (req, res) => {
  try {
    const { class: cls, arm, grid } = req.body;
    if (!cls || !arm) return fail(res, 400, 'class and arm are required.');
    if (!canManageClass(req.user, cls, arm))
      return fail(res, 403, 'You can only manage the timetable for your assigned class/arm.');
    if (!grid || typeof grid !== 'object' || Array.isArray(grid))
      return fail(res, 400, 'grid must be an object keyed by day name.');

    const cleaned = {};
    VALID_DAYS.forEach(d => {
      cleaned[d] = {};
      VALID_PERIODS.forEach(p => {
        const val = grid[d]?.[p];
        if (val && String(val).trim()) cleaned[d][p] = String(val).trim();
      });
    });

    const key = classKey(cls, arm);
    await db.run(
      `INSERT INTO timetables (class_key, class_name, arm, grid, updated_by)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE grid=VALUES(grid), updated_by=VALUES(updated_by), updated_at=NOW()`,
      [key, cls, arm, JSON.stringify(cleaned), req.user?.name || null]
    );

    return ok(res, hydratedGrid(cleaned), { class: cls, arm });
  } catch (e) { return fail(res, 500, e.message); }
};

/* PATCH /api/timetable/cell — single cell update */
exports.updateCell = async (req, res) => {
  try {
    const { class: cls, arm, day, period, subject } = req.body;
    if (!cls || !arm || !day || !period) return fail(res, 400, 'class, arm, day, and period are required.');
    if (!VALID_DAYS.includes(day))    return fail(res, 400, `"${day}" is not a valid day.`);
    if (!VALID_PERIODS.includes(period)) return fail(res, 400, `"${period}" is not a valid period.`);
    if (!canManageClass(req.user, cls, arm))
      return fail(res, 403, 'You can only manage the timetable for your assigned class/arm.');

    const key = classKey(cls, arm);
    const row = await db.query1('SELECT grid FROM timetables WHERE class_key=?', [key]);
    const grid = row?.grid ? (typeof row.grid === 'string' ? JSON.parse(row.grid) : row.grid) : {};

    if (!grid[day]) grid[day] = {};
    if (subject && String(subject).trim()) {
      grid[day][period] = String(subject).trim();
    } else {
      delete grid[day][period];
    }

    await db.run(
      `INSERT INTO timetables (class_key, class_name, arm, grid, updated_by)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE grid=VALUES(grid), updated_by=VALUES(updated_by), updated_at=NOW()`,
      [key, cls, arm, JSON.stringify(grid), req.user?.name || null]
    );

    return ok(res, { class: cls, arm, day, period, subject: grid[day]?.[period] || '' });
  } catch (e) { return fail(res, 500, e.message); }
};

/* DELETE /api/timetable?class=&arm= */
exports.clear = async (req, res) => {
  try {
    const { class: cls, arm } = req.query;
    if (!cls || !arm) return fail(res, 400, 'class and arm are required.');
    await db.run('DELETE FROM timetables WHERE class_key=?', [classKey(cls, arm)]);
    return ok(res, { message: `Timetable cleared for ${cls} ${arm}.` });
  } catch (e) { return fail(res, 500, e.message); }
};

/* GET /api/timetable/all */
exports.getAll = async (req, res) => {
  try {
    const rows = await db.query('SELECT * FROM timetables ORDER BY class_name, arm');
    const data = rows.map(r => ({
      key: r.class_key, class: r.class_name, arm: r.arm,
      data: hydratedGrid(r.grid), updatedAt: r.updated_at,
    }));
    return ok(res, data, { days: VALID_DAYS, periods: VALID_PERIODS, total: data.length });
  } catch (e) { return fail(res, 500, e.message); }
};

/* GET /api/timetable/teacher/:teacherId */
exports.getTeacherSlots = async (req, res) => {
  try {
    const teacher = await db.query1(
      `SELECT st.*, c.name AS class_name FROM staff st LEFT JOIN classes c ON c.id=st.class_id WHERE st.id=?`,
      [req.params.teacherId]
    );
    if (!teacher) return fail(res, 404, `Teacher "${req.params.teacherId}" not found.`);

    const subjects = teacher.subject ? [teacher.subject] : [];
    const rows = await db.query('SELECT * FROM timetables');
    const slots = [];

    rows.forEach(r => {
      const grid = typeof r.grid === 'string' ? JSON.parse(r.grid) : r.grid;
      VALID_DAYS.forEach(day => {
        VALID_PERIODS.forEach(period => {
          const subj = grid[day]?.[period];
          if (subj && subjects.includes(subj)) {
            slots.push({ class: r.class_name, arm: r.arm, day, period, subject: subj });
          }
        });
      });
    });

    return ok(res, slots, { teacher: { id: teacher.id, name: teacher.name, subjects }, total: slots.length });
  } catch (e) { return fail(res, 500, e.message); }
};