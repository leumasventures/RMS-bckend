'use strict';

/**
 * studentController.js — Sacred Heart College (SAHARCO)
 * ALL writes go to MySQL via db.pool. In-memory cache is kept in sync.
 */

const db = require('../config/db');

const VALID_GENDERS  = ['Male', 'Female'];
const VALID_STATUSES = ['active', 'suspended', 'graduated', 'withdrawn', 'transferred'];

const fail = (res, status, msg, extra = {}) =>
  res.status(status).json({ success: false, message: msg, ...extra });

const ok = (res, data, meta = {}, status = 200) =>
  res.status(status).json({ success: true, ...meta, data });

/**
 * Resolve student ID from request params.
 * Supports both:
 *   /api/students/SHC031        → req.params.id = 'SHC031'
 *   /api/students/SHC/031       → req.params.school = 'SHC', req.params.id = '031'
 */
function resolveId(req) {
  return req.params.school
    ? `${req.params.school}/${req.params.id}`
    : req.params.id;
}

function generateStudentId() {
  const existing = new Set((db.students || []).map(s => s.id));
  let n = (db.students || []).length + 1, id;
  do { id = `SHC/${String(n).padStart(3, '0')}`; n++; } while (existing.has(id));
  return id;
}

function parseAttendance(val) {
  const n = Number(val);
  if (isNaN(n) || n < 0 || n > 100) throw new Error('attendance must be 0–100.');
  return Math.round(n);
}

function teacherCanAccess(req, res, student) {
  const { assignedClass, assignedArm } = req.user;
  if (student.class !== assignedClass) {
    fail(res, 403, 'Access restricted to your assigned class.'); return false;
  }
  if (assignedArm && student.arm !== assignedArm) {
    fail(res, 403, 'Access restricted to your assigned arm.'); return false;
  }
  return true;
}

/* ── GET /api/students ──────────────────────────────────────────────────── */
exports.getAll = async (req, res) => {
  try {
    const { role, assignedClass, assignedArm, wardId } = req.user;
    let { class: cls, arm, gender, search, attnBelow, attnAbove,
          sortBy = 'name', sortDir = 'asc', page = 1, limit = 100 } = req.query;

    let sql = `SELECT s.*, c.name AS class_name FROM students s
               LEFT JOIN classes c ON c.id = s.class_id WHERE 1=1`;
    const params = [];

    if (role === 'Parent') {
      sql += ' AND s.id = ?'; params.push(wardId);
    } else {
      if (role === 'Teacher') { cls = assignedClass; arm = arm || assignedArm; }
      if (cls)    { sql += ' AND c.name = ?';   params.push(cls); }
      if (arm)    { sql += ' AND s.arm = ?';    params.push(arm); }
      if (gender) { sql += ' AND s.gender = ?'; params.push(gender); }
      if (search) { sql += ' AND s.name LIKE ?';params.push(`%${search}%`); }
      if (attnBelow != null) { sql += ' AND s.attendance <= ?'; params.push(Number(attnBelow)); }
      if (attnAbove != null) { sql += ' AND s.attendance >= ?'; params.push(Number(attnAbove)); }
    }

    const safe = ['name','id','arm','gender','attendance'].includes(sortBy) ? sortBy : 'name';
    const dir  = sortDir === 'desc' ? 'DESC' : 'ASC';
    sql += ` ORDER BY s.${safe} ${dir}`;

    const pgNum  = Math.max(1, parseInt(page));
    const pgSize = Math.min(500, Math.max(1, parseInt(limit)));
    sql += ` LIMIT ${pgSize} OFFSET ${(pgNum - 1) * pgSize}`;

    const rows = await db.query(sql, params);
    const data = rows.map(s => ({
      id: s.id, name: s.name, class: s.class_name, arm: s.arm,
      gender: s.gender, dob: s.dob, parent: s.parent, phone: s.phone,
      attendance: parseFloat(s.attendance), active: !!s.active, status: s.status,
    }));
    return ok(res, data, { count: data.length });
  } catch (e) { return fail(res, 500, e.message); }
};

/* ── GET /api/students/:id  or  /api/students/:school/:id ──────────────── */
exports.getOne = async (req, res) => {
  try {
    const id = resolveId(req);
    const rows = await db.query(
      `SELECT s.*, c.name AS class_name FROM students s
       LEFT JOIN classes c ON c.id = s.class_id WHERE s.id = ?`, [id]);
    if (!rows.length) return fail(res, 404, 'Student not found.');
    const s = rows[0];
    if (req.user.role === 'Teacher' && !teacherCanAccess(req, res, { class: s.class_name, arm: s.arm })) return;
    return ok(res, {
      id: s.id, name: s.name, class: s.class_name, arm: s.arm,
      gender: s.gender, dob: s.dob, parent: s.parent, phone: s.phone,
      attendance: parseFloat(s.attendance), active: !!s.active, status: s.status,
    });
  } catch (e) { return fail(res, 500, e.message); }
};

/* ── GET /api/students/:id/summary  or  /:school/:id/summary ───────────── */
exports.getSummary = async (req, res) => {
  try {
    const id = resolveId(req);
    const { term, session } = req.query;
    const s = await db.query(
      `SELECT s.*, c.name AS class_name FROM students s
       LEFT JOIN classes c ON c.id = s.class_id WHERE s.id = ?`, [id]);
    if (!s.length) return fail(res, 404, 'Student not found.');
    const student = s[0];

    const [results, attRows] = await Promise.all([
      db.query('SELECT * FROM results WHERE student_id=? AND term=? AND session=?',
               [id, term, session]),
      db.query('SELECT status, COUNT(*) AS cnt FROM attendance WHERE student_id=? AND term=? AND session=? GROUP BY status',
               [id, term, session]),
    ]);

    const total = results.reduce((a, r) => a + r.total, 0);
    const avg   = results.length ? parseFloat((total / results.length).toFixed(1)) : 0;
    const att   = {};
    attRows.forEach(r => { att[r.status] = r.cnt; });

    return ok(res, {
      student: { id: student.id, name: student.name, class: student.class_name, arm: student.arm },
      results: { count: results.length, total, average: avg },
      attendance: { present: att.p || 0, late: att.l || 0, absent: att.a || 0, excused: att.e || 0 },
    });
  } catch (e) { return fail(res, 500, e.message); }
};

/* ── POST /api/students ─────────────────────────────────────────────────── */
exports.create = async (req, res) => {
  try {
    const { name, class: cls, arm, gender = 'Male', dob, parent, phone, attendance, id: rawId } = req.body ?? {};
    if (!name) return fail(res, 400, 'name is required.');
    if (!cls)  return fail(res, 400, 'class is required.');
    if (!arm)  return fail(res, 400, 'arm is required.');
    if (!VALID_GENDERS.includes(gender)) return fail(res, 400, `gender must be Male or Female.`);

    const clsObj = db.findClass(cls);
    if (!clsObj) return fail(res, 400, `Class "${cls}" does not exist.`);
    if (clsObj.arms?.length && !clsObj.arms.includes(arm))
      return fail(res, 400, `Arm "${arm}" does not exist in "${cls}".`);

    const id = rawId ? String(rawId).trim() : generateStudentId();
    const existing = await db.query1('SELECT id FROM students WHERE id = ?', [id]);
    if (existing) return fail(res, 409, `Student ID "${id}" already exists.`);

    let attn = 100;
    if (attendance != null) {
      try { attn = parseAttendance(attendance); } catch (e) { return fail(res, 400, e.message); }
    }

    await db.run(
      `INSERT INTO students (id, name, class_id, arm, gender, dob, parent, phone, attendance, active, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'active')`,
      [id, String(name).trim(), clsObj.id, arm, gender, dob || null, parent || '', phone || '', attn]
    );

    const student = {
      id, name: String(name).trim(), class: cls, arm, gender,
      dob: dob || '', parent: parent || '', phone: phone || '',
      attendance: attn, active: true, status: 'active',
    };
    db.students.push(student);

    return ok(res, student, {}, 201);
  } catch (e) { return fail(res, 500, e.message); }
};

/* ── POST /api/students/bulk ────────────────────────────────────────────── */
exports.bulkCreate = async (req, res) => {
  try {
    const { class: cls, arm, students: rows } = req.body ?? {};
    if (!cls || !arm) return fail(res, 400, 'class and arm are required.');
    if (!Array.isArray(rows) || !rows.length) return fail(res, 400, 'students must be a non-empty array.');
    if (rows.length > 200) return fail(res, 400, 'Max 200 students per bulk request.');

    const clsObj = db.findClass(cls);
    if (!clsObj) return fail(res, 400, `Class "${cls}" does not exist.`);

    const created = [], skipped = [];

    for (let i = 0; i < rows.length; i++) {
      const row  = rows[i];
      const name = String(row.name ?? '').trim();
      if (!name) { skipped.push({ row: i + 1, reason: 'name required' }); continue; }
      const gender = row.gender ?? 'Male';
      if (!VALID_GENDERS.includes(gender)) { skipped.push({ row: i + 1, reason: `invalid gender "${gender}"` }); continue; }

      const id = generateStudentId();
      try {
        await db.run(
          `INSERT INTO students (id, name, class_id, arm, gender, dob, parent, phone, attendance, active, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 100, 1, 'active')`,
          [id, name, clsObj.id, arm, gender, row.dob || null, row.parent || '', row.phone || '']
        );
        const s = {
          id, name, class: cls, arm, gender,
          dob: row.dob || '', parent: row.parent || '', phone: row.phone || '',
          attendance: 100, active: true, status: 'active',
        };
        db.students.push(s);
        created.push(s);
      } catch (e) {
        skipped.push({ row: i + 1, reason: e.message });
      }
    }

    return ok(res, created, { imported: created.length, skipped: skipped.length, errors: skipped }, 201);
  } catch (e) { return fail(res, 500, e.message); }
};

/* ── PUT /api/students/:id  or  /:school/:id ────────────────────────────── */
exports.update = async (req, res) => {
  try {
    const id = resolveId(req);
    const row = await db.query1(
      `SELECT s.*, c.name AS class_name FROM students s
       LEFT JOIN classes c ON c.id = s.class_id WHERE s.id = ?`, [id]);
    if (!row) return fail(res, 404, 'Student not found.');

    const { name, class: cls, arm, gender, dob, parent, phone, attendance } = req.body ?? {};
    let classId   = row.class_id;
    let className = row.class_name;

    if (cls && cls !== row.class_name) {
      const clsObj = db.findClass(cls);
      if (!clsObj) return fail(res, 400, `Class "${cls}" does not exist.`);
      classId = clsObj.id; className = cls;
    }

    const newArm    = arm    ?? row.arm;
    const newName   = name   ?? row.name;
    const newGender = gender ?? row.gender;
    const newDob    = dob    ?? row.dob;
    const newParent = parent ?? row.parent;
    const newPhone  = phone  ?? row.phone;
    let   newAttn   = parseFloat(row.attendance);
    if (attendance != null) {
      try { newAttn = parseAttendance(attendance); } catch (e) { return fail(res, 400, e.message); }
    }

    await db.run(
      `UPDATE students SET name=?, class_id=?, arm=?, gender=?, dob=?, parent=?, phone=?, attendance=?
       WHERE id=?`,
      [newName, classId, newArm, newGender, newDob || null, newParent, newPhone, newAttn, id]
    );

    const cached = db.findStudent(id);
    if (cached) Object.assign(cached, {
      name: newName, class: className, arm: newArm,
      gender: newGender, dob: newDob || '', parent: newParent,
      phone: newPhone, attendance: newAttn,
    });

    return ok(res, {
      id, name: newName, class: className, arm: newArm, gender: newGender,
      dob: newDob, parent: newParent, phone: newPhone, attendance: newAttn,
    });
  } catch (e) { return fail(res, 500, e.message); }
};

/* ── PATCH /api/students/:id/transfer  or  /:school/:id/transfer ────────── */
exports.transfer = async (req, res) => {
  try {
    const id = resolveId(req);
    const { class: newCls, arm: newArm } = req.body ?? {};
    if (!newCls || !newArm) return fail(res, 400, 'class and arm are required.');

    const row = await db.query1('SELECT * FROM students WHERE id = ?', [id]);
    if (!row) return fail(res, 404, 'Student not found.');

    const clsObj = db.findClass(newCls);
    if (!clsObj) return fail(res, 400, `Class "${newCls}" does not exist.`);

    await db.run('UPDATE students SET class_id=?, arm=? WHERE id=?', [clsObj.id, newArm, id]);

    const cached = db.findStudent(id);
    if (cached) { cached.class = newCls; cached.arm = newArm; }

    return ok(res, { id, class: newCls, arm: newArm, previousClass: row.class_id, transferred: true });
  } catch (e) { return fail(res, 500, e.message); }
};

/* ── PATCH /api/students/:id/attendance  or  /:school/:id/attendance ────── */
exports.updateAttendance = async (req, res) => {
  try {
    const id = resolveId(req);
    let attn;
    try { attn = parseAttendance(req.body?.attendance); } catch (e) { return fail(res, 400, e.message); }

    const row = await db.query1('SELECT id FROM students WHERE id = ?', [id]);
    if (!row) return fail(res, 404, 'Student not found.');

    await db.run('UPDATE students SET attendance=? WHERE id=?', [attn, id]);
    const cached = db.findStudent(id);
    if (cached) cached.attendance = attn;

    return ok(res, { id, attendance: attn });
  } catch (e) { return fail(res, 500, e.message); }
};

/* ── PATCH /api/students/:id/status  or  /:school/:id/status ───────────── */
exports.setStatus = async (req, res) => {
  try {
    const id = resolveId(req);
    const { status } = req.body ?? {};
    if (!VALID_STATUSES.includes(status)) return fail(res, 400, `Invalid status "${status}".`);

    const row = await db.query1('SELECT id FROM students WHERE id = ?', [id]);
    if (!row) return fail(res, 404, 'Student not found.');

    const active = status === 'active' ? 1 : 0;
    await db.run('UPDATE students SET status=?, active=? WHERE id=?', [status, active, id]);
    const cached = db.findStudent(id);
    if (cached) { cached.status = status; cached.active = !!active; }

    return ok(res, { id, status, active: !!active });
  } catch (e) { return fail(res, 500, e.message); }
};

/* ── DELETE /api/students/:id  or  /:school/:id ────────────────────────── */
exports.remove = async (req, res) => {
  try {
    const id = resolveId(req);
    const row = await db.query1('SELECT id, name FROM students WHERE id = ?', [id]);
    if (!row) return fail(res, 404, 'Student not found.');

    await db.run('DELETE FROM students WHERE id = ?', [id]);
    db.students = db.students.filter(s => s.id !== id);

    return ok(res, { id, deleted: true, name: row.name });
  } catch (e) { return fail(res, 500, e.message); }
};

/* ── GET /api/students/export ───────────────────────────────────────────── */
exports.exportStudents = async (req, res) => {
  try {
    const { class: cls, arm } = req.query;
    let sql = `SELECT s.*, c.name AS class_name FROM students s
               LEFT JOIN classes c ON c.id = s.class_id WHERE 1=1`;
    const params = [];
    if (cls) { sql += ' AND c.name = ?'; params.push(cls); }
    if (arm) { sql += ' AND s.arm = ?';  params.push(arm); }
    sql += ' ORDER BY c.name, s.arm, s.name';

    const rows = await db.query(sql, params);
    const lines = ['ID,Name,Class,Arm,Gender,DOB,Parent,Phone,Attendance'];
    rows.forEach(s => lines.push(
      [s.id, s.name, s.class_name, s.arm, s.gender,
       s.dob || '', s.parent || '', s.phone || '', s.attendance].join(',')
    ));

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="students.csv"');
    return res.send(lines.join('\n'));
  } catch (e) { return fail(res, 500, e.message); }
};

/* ── GET /api/students/:id/results  or  /:school/:id/results ───────────── */
exports.getResults = async (req, res) => {
  try {
    const id = resolveId(req);
    const { term, session } = req.query;
    const rows = await db.query(
      `SELECT * FROM results WHERE student_id=?${term ? ' AND term=?' : ''}${session ? ' AND session=?' : ''} ORDER BY subject_name`,
      [id, ...(term ? [term] : []), ...(session ? [session] : [])]
    );
    return ok(res, rows, { count: rows.length });
  } catch (e) { return fail(res, 500, e.message); }
};

/* ── GET /api/students/:id/attendance  or  /:school/:id/attendance ──────── */
exports.getAttendance = async (req, res) => {
  try {
    const id = resolveId(req);
    const { term, session } = req.query;
    const rows = await db.query(
      `SELECT * FROM attendance WHERE student_id=?${term ? ' AND term=?' : ''}${session ? ' AND session=?' : ''} ORDER BY date`,
      [id, ...(term ? [term] : []), ...(session ? [session] : [])]
    );
    const counts = { p: 0, l: 0, a: 0, e: 0 };
    rows.forEach(r => { if (counts[r.status] !== undefined) counts[r.status]++; });
    return ok(res, rows, { counts });
  } catch (e) { return fail(res, 500, e.message); }
};

/* ── GET /api/students/:id/report-card  or  /:school/:id/report-card ────── */
exports.getReportCard = async (req, res) => {
  try {
    const id = resolveId(req);
    const { term, session } = req.query;
    const [sRows, results, remark, domain, attRows] = await Promise.all([
      db.query(`SELECT s.*, c.name AS class_name FROM students s
                LEFT JOIN classes c ON c.id=s.class_id WHERE s.id=?`, [id]),
      db.query('SELECT * FROM results WHERE student_id=? AND term=? AND session=? ORDER BY subject_name',
               [id, term, session]),
      db.query1('SELECT * FROM report_card_remarks WHERE student_id=? AND term=? AND session=?',
                [id, term, session]),
      db.query1('SELECT * FROM domain_assessments WHERE student_id=? AND term=? AND session=?',
                [id, term, session]),
      db.query('SELECT status, COUNT(*) AS cnt FROM attendance WHERE student_id=? AND term=? AND session=? GROUP BY status',
               [id, term, session]),
    ]);

    if (!sRows.length) return fail(res, 404, 'Student not found.');
    const s = sRows[0];

    const total = results.reduce((a, r) => a + r.total, 0);
    const avg   = results.length ? parseFloat((total / results.length).toFixed(1)) : 0;
    const att   = {};
    attRows.forEach(r => { att[r.status] = Number(r.cnt); });

    return ok(res, {
      student:    { id: s.id, name: s.name, class: s.class_name, arm: s.arm, gender: s.gender, dob: s.dob },
      results,    average: avg, totalScore: total,
      remark:     remark || {},
      domain:     domain || {},
      attendance: { present: att.p || 0, late: att.l || 0, absent: att.a || 0, excused: att.e || 0 },
      schoolInfo: db.schoolInfo,
    });
  } catch (e) { return fail(res, 500, e.message); }
};