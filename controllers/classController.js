'use strict';

/**
 * classController.js — Sacred Heart College (SAHARCO)
 * ALL writes persist to MySQL.
 */

const db = require('../config/db');

const fail = (res, s, m) => res.status(s).json({ success: false, message: m });
const ok   = (res, data, meta = {}, s = 200) => res.status(s).json({ success: true, ...meta, data });

/* ── GET /api/classes ──────────────────────────────────────────────────── */
exports.getAll = async (req, res) => {
  try {
    const { level, search } = req.query;
    const user = req.user;

    // Teachers only see their assigned class
    if (user && user.role === 'Teacher') {
      const tc = user.assignedClass || user.assigned_class || null;
      const ta = user.assignedArm   || user.assigned_arm   || null;
      if (!tc) return ok(res, [], { count: 0 });
      const rows = await db.query(
        `SELECT c.*, GROUP_CONCAT(a.arm ORDER BY a.arm) AS arms_csv
           FROM classes c LEFT JOIN class_arms a ON a.class_id=c.id
          WHERE c.name=? GROUP BY c.id`, [tc]);
      const data = rows.map(r => ({
        id: r.id, name: r.name, level: r.level,
        arms: ta ? [ta] : (r.arms_csv ? r.arms_csv.split(',') : []),
      }));
      return ok(res, data, { count: data.length });
    }

    let sql = 'SELECT c.*, GROUP_CONCAT(a.arm ORDER BY a.arm) AS arms_csv FROM classes c LEFT JOIN class_arms a ON a.class_id=c.id WHERE 1=1';
    const params = [];
    if (level)  { sql += ' AND c.level = ?';       params.push(level); }
    if (search) { sql += ' AND c.name LIKE ?';      params.push(`%${search}%`); }
    sql += ' GROUP BY c.id ORDER BY c.name';

    const rows = await db.query(sql, params);
    const data = rows.map(r => ({
      id: r.id, name: r.name, level: r.level,
      arms: r.arms_csv ? r.arms_csv.split(',') : [],
    }));
    return ok(res, data, { count: data.length });
  } catch (e) { return fail(res, 500, e.message); }
};

/* ── GET /api/classes/:name ─────────────────────────────────────────────── */
exports.getOne = async (req, res) => {
  try {
    const rows = await db.query(
      `SELECT c.*, GROUP_CONCAT(a.arm ORDER BY a.arm) AS arms_csv
       FROM classes c LEFT JOIN class_arms a ON a.class_id=c.id
       WHERE c.name=? GROUP BY c.id`, [req.params.name]);
    if (!rows.length) return fail(res, 404, 'Class not found.');
    const r = rows[0];
    const arms = r.arms_csv ? r.arms_csv.split(',') : [];
    const studentCounts = {};
    await Promise.all(arms.map(async arm => {
      const cnt = await db.query1('SELECT COUNT(*) AS n FROM students WHERE class_id=? AND arm=? AND active=1', [r.id, arm]);
      studentCounts[arm] = Number(cnt?.n) || 0;
    }));
    return ok(res, { id: r.id, name: r.name, level: r.level, arms, studentCounts });
  } catch (e) { return fail(res, 500, e.message); }
};

/* ── POST /api/classes ──────────────────────────────────────────────────── */
exports.create = async (req, res) => {
  try {
    const { name, level, arms = [] } = req.body ?? {};
    if (!name)  return fail(res, 400, 'name is required.');
    if (!level) return fail(res, 400, 'level is required.');

    const exists = await db.query1('SELECT id FROM classes WHERE name=?', [name]);
    if (exists) return fail(res, 409, `Class "${name}" already exists.`);

    const result = await db.run('INSERT INTO classes (name, level) VALUES (?, ?)', [name, level]);
    const classId = result.insertId;

    for (const arm of arms) {
      await db.run('INSERT IGNORE INTO class_arms (class_id, arm) VALUES (?, ?)', [classId, arm]);
    }

    const cls = { id: classId, name, level, arms };
    db.classes.push(cls);

    return ok(res, cls, {}, 201);
  } catch (e) { return fail(res, 500, e.message); }
};

/* ── PUT /api/classes/:name ─────────────────────────────────────────────── */
exports.update = async (req, res) => {
  try {
    const row = await db.query1('SELECT * FROM classes WHERE name=?', [req.params.name]);
    if (!row) return fail(res, 404, 'Class not found.');

    const { name: newName, level: newLevel } = req.body ?? {};
    const name  = newName  || row.name;
    const level = newLevel || row.level;

    await db.run('UPDATE classes SET name=?, level=? WHERE id=?', [name, level, row.id]);

    const cached = db.classes.find(c => c.id === row.id);
    if (cached) { cached.name = name; cached.level = level; }

    return ok(res, { id: row.id, name, level });
  } catch (e) { return fail(res, 500, e.message); }
};

/* ── DELETE /api/classes/:name ──────────────────────────────────────────── */
exports.remove = async (req, res) => {
  try {
    const row = await db.query1('SELECT * FROM classes WHERE name=?', [req.params.name]);
    if (!row) return fail(res, 404, 'Class not found.');

    const students = await db.query1('SELECT COUNT(*) AS n FROM students WHERE class_id=?', [row.id]);
    if (Number(students?.n) > 0) return fail(res, 409, 'Cannot delete class with enrolled students.');

    await db.run('DELETE FROM classes WHERE id=?', [row.id]);
    db.classes = db.classes.filter(c => c.id !== row.id);

    return ok(res, { id: row.id, name: row.name, deleted: true });
  } catch (e) { return fail(res, 500, e.message); }
};

/* ── GET /api/classes/:name/arms ────────────────────────────────────────── */
exports.getArms = async (req, res) => {
  try {
    const row = await db.query1('SELECT id FROM classes WHERE name=?', [req.params.name]);
    if (!row) return fail(res, 404, 'Class not found.');
    const arms = await db.query('SELECT arm FROM class_arms WHERE class_id=? ORDER BY arm', [row.id]);
    return ok(res, arms.map(a => a.arm));
  } catch (e) { return fail(res, 500, e.message); }
};

/* ── POST /api/classes/:name/arms ───────────────────────────────────────── */
exports.addArm = async (req, res) => {
  try {
    const { arm, arms: armsArr } = req.body ?? {};
    const toAdd = armsArr?.length ? armsArr : arm ? [arm] : [];
    if (!toAdd.length) return fail(res, 400, 'arm or arms[] required.');

    const row = await db.query1('SELECT id FROM classes WHERE name=?', [req.params.name]);
    if (!row) return fail(res, 404, 'Class not found.');

    for (const a of toAdd) {
      await db.run('INSERT IGNORE INTO class_arms (class_id, arm) VALUES (?, ?)', [row.id, a]);
    }

    const cached = db.classes.find(c => c.id === row.id);
    if (cached) {
      toAdd.forEach(a => { if (!cached.arms.includes(a)) cached.arms.push(a); });
    }

    const updated = await db.query('SELECT arm FROM class_arms WHERE class_id=? ORDER BY arm', [row.id]);
    return ok(res, { name: req.params.name, arms: updated.map(a => a.arm) });
  } catch (e) { return fail(res, 500, e.message); }
};

/* ── PATCH /api/classes/:name/arms/:arm ─────────────────────────────────── */
exports.renameArm = async (req, res) => {
  try {
    const { name, arm } = req.params;
    const { new_name }  = req.body ?? {};
    if (!new_name) return fail(res, 400, 'new_name is required.');

    const row = await db.query1('SELECT id FROM classes WHERE name=?', [name]);
    if (!row) return fail(res, 404, 'Class not found.');

    await db.run('UPDATE class_arms SET arm=? WHERE class_id=? AND arm=?', [new_name, row.id, arm]);
    await db.run('UPDATE students SET arm=? WHERE class_id=? AND arm=?',   [new_name, row.id, arm]);
    await db.run('UPDATE attendance SET arm=? WHERE class_id=? AND arm=?', [new_name, row.id, arm]);
    await db.run('UPDATE results SET arm=? WHERE class_id=? AND arm=?',    [new_name, row.id, arm]);

    const cached = db.classes.find(c => c.id === row.id);
    if (cached) {
      const i = cached.arms.indexOf(arm);
      if (i >= 0) cached.arms[i] = new_name;
    }
    db.students.forEach(s => { if (s.class === name && s.arm === arm) s.arm = new_name; });

    return ok(res, { class: name, oldArm: arm, newArm: new_name });
  } catch (e) { return fail(res, 500, e.message); }
};

/* ── DELETE /api/classes/:name/arms/:arm ────────────────────────────────── */
exports.deleteArm = async (req, res) => {
  try {
    const { name, arm } = req.params;
    const row = await db.query1('SELECT id FROM classes WHERE name=?', [name]);
    if (!row) return fail(res, 404, 'Class not found.');

    const students = await db.query1('SELECT COUNT(*) AS n FROM students WHERE class_id=? AND arm=? AND active=1', [row.id, arm]);
    if (Number(students?.n) > 0) return fail(res, 409, `Cannot delete arm "${arm}" — it has active students.`);

    await db.run('DELETE FROM class_arms WHERE class_id=? AND arm=?', [row.id, arm]);

    const cached = db.classes.find(c => c.id === row.id);
    if (cached) cached.arms = cached.arms.filter(a => a !== arm);

    return ok(res, { class: name, arm, deleted: true });
  } catch (e) { return fail(res, 500, e.message); }
};

/* ── GET /api/classes/:name/students ────────────────────────────────────── */
exports.getStudents = async (req, res) => {
  try {
    let { arm } = req.query;
    const user = req.user;

    // Teachers scoped to their arm only
    if (user && user.role === 'Teacher') {
      const tc = user.assignedClass || user.assigned_class || null;
      const ta = user.assignedArm   || user.assigned_arm   || null;
      if (tc && req.params.name !== tc)
        return res.status(403).json({ success: false, message: `Access denied. You are assigned to ${tc} only.` });
      if (ta) arm = ta; // force arm to teacher's arm
    }

    const row = await db.query1('SELECT id FROM classes WHERE name=?', [req.params.name]);
    if (!row) return fail(res, 404, 'Class not found.');

    let sql = 'SELECT * FROM students WHERE class_id=? AND active=1';
    const params = [row.id];
    if (arm) { sql += ' AND arm=?'; params.push(arm); }
    sql += ' ORDER BY arm, name';

    const rows = await db.query(sql, params);
    return ok(res, rows, { count: rows.length });
  } catch (e) { return fail(res, 500, e.message); }
};

/* ── GET /api/classes/:name/summary ─────────────────────────────────────── */
exports.getSummary = async (req, res) => {
  try {
    const { arm, term, session } = req.query;
    const row = await db.query1('SELECT id FROM classes WHERE name=?', [req.params.name]);
    if (!row) return fail(res, 404, 'Class not found.');

    const [students, results, attRows] = await Promise.all([
      db.query('SELECT COUNT(*) AS n FROM students WHERE class_id=? AND active=1' + (arm ? ' AND arm=?' : ''), arm ? [row.id, arm] : [row.id]),
      term && session ? db.query(
        'SELECT student_id, ROUND(AVG(total),1) AS avg FROM results WHERE class_id=?' +
        (arm ? ' AND arm=?' : '') + ' AND term=? AND session=? GROUP BY student_id',
        arm ? [row.id, arm, term, session] : [row.id, term, session]
      ) : Promise.resolve([]),
      term && session ? db.query(
        'SELECT status, COUNT(*) AS n FROM attendance WHERE class_id=?' +
        (arm ? ' AND arm=?' : '') + ' AND term=? AND session=? GROUP BY status',
        arm ? [row.id, arm, term, session] : [row.id, term, session]
      ) : Promise.resolve([]),
    ]);

    const avgs = results.map(r => r.avg);
    const classAvg = avgs.length ? parseFloat((avgs.reduce((a, v) => a + v, 0) / avgs.length).toFixed(1)) : null;
    const attMap = {};
    attRows.forEach(r => { attMap[r.status] = Number(r.n); });

    return ok(res, {
      class: req.params.name, arm: arm || 'all',
      studentCount: Number(students[0]?.n) || 0,
      term, session, classAverage: classAvg,
      attendance: { present: attMap.p || 0, late: attMap.l || 0, absent: attMap.a || 0, excused: attMap.e || 0 },
    });
  } catch (e) { return fail(res, 500, e.message); }
};

/* ── PATCH /api/classes/:name/assign-teacher ────────────────────────────── */
exports.assignTeacher = async (req, res) => {
  try {
    const { teacher_id, arm } = req.body ?? {};
    if (!teacher_id) return fail(res, 400, 'teacher_id is required.');

    const [cls, teacher] = await Promise.all([
      db.query1('SELECT id FROM classes WHERE name=?', [req.params.name]),
      db.query1('SELECT id FROM staff WHERE id=?', [teacher_id]),
    ]);
    if (!cls)     return fail(res, 404, 'Class not found.');
    if (!teacher) return fail(res, 404, 'Teacher not found.');

    await db.run('UPDATE staff SET class_id=?, arm=? WHERE id=?', [cls.id, arm || null, teacher_id]);

    const cached = db.staff.find(s => s.id === teacher_id);
    if (cached) { cached.class = req.params.name; cached.arm = arm || ''; }

    return ok(res, { class: req.params.name, arm, teacherId: teacher_id, assigned: true });
  } catch (e) { return fail(res, 500, e.message); }
};