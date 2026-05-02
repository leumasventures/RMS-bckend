'use strict';

/**
 * studentController.js — Sacred Heart College Eziukwu Aba (SAHARCO)
 * ──────────────────────────────────────────────────────────────────
 * GET    /api/students              → getAll   (Admin, Teacher, Parent)
 * GET    /api/students/:id          → getOne   (Admin, Teacher, Parent)
 * GET    /api/students/:id/summary  → getSummary (Admin, Teacher)
 * POST   /api/students              → create   (Admin)
 * POST   /api/students/bulk         → bulkCreate (Admin)
 * PUT    /api/students/:id          → update   (Admin)
 * PATCH  /api/students/:id/transfer → transfer (Admin)
 * PATCH  /api/students/:id/attendance → updateAttendance (Admin, Teacher)
 * DELETE /api/students/:id          → remove   (Admin)
 *
 * Role access matrix:
 *   Admin   → full CRUD + bulk + transfer
 *   Teacher → read own class/arm only + attendance update
 *   Parent  → read own ward only
 */

const db = require('../config/db');

// ── Helpers ───────────────────────────────────────────────────────────────────

const fail = (res, status, message, extra = {}) =>
  res.status(status).json({ success: false, message, ...extra });

const ok = (res, data, meta = {}, status = 200) =>
  res.status(status).json({ success: true, ...meta, data });

const VALID_GENDERS   = ['Male', 'Female'];
const VALID_ATTN_SORT = ['asc', 'desc'];
const VALID_SORT_COLS = ['name', 'id', 'class', 'arm', 'gender', 'attendance'];

/**
 * Confirm a Teacher can access the given student.
 * Returns true if allowed, false (and sends 403) otherwise.
 */
function teacherCanAccess(req, res, student) {
  const { assignedClass, assignedArm } = req.user;
  if (student.class !== assignedClass) {
    fail(res, 403, 'Access restricted to your assigned class.');
    return false;
  }
  if (assignedArm && student.arm !== assignedArm) {
    fail(res, 403, 'Access restricted to your assigned arm.');
    return false;
  }
  return true;
}

/**
 * Validate and coerce an attendance value.
 * Returns a number 0–100 or throws a ValidationError message string.
 */
function parseAttendance(val) {
  const n = Number(val);
  if (isNaN(n) || n < 0 || n > 100)
    throw new Error('attendance must be a number between 0 and 100.');
  return Math.round(n);
}

// ── GET /api/students ─────────────────────────────────────────────────────────

/**
 * Query params (Admin only):
 *   class, arm, gender, search,
 *   attnBelow (number), attnAbove (number),
 *   sortBy (name|id|class|arm|gender|attendance), sortDir (asc|desc),
 *   page (default 1), limit (default 50, max 200)
 */
exports.getAll = (req, res) => {
  const { role, assignedClass, assignedArm, wardId } = req.user;

  // ── Role-scoped base list ─────────────────────────────────────────────────

  if (role === 'Parent') {
    const ward = wardId ? db.findStudent(wardId) : null;
    return ok(res, ward ? [ward] : [], { total: ward ? 1 : 0 });
  }

  if (role === 'Teacher') {
    const data = db.studentsInClass(assignedClass, assignedArm);
    return ok(res, data, { total: data.length });
  }

  // ── Admin: full filter + sort + paginate ──────────────────────────────────

  const {
    class: cls, arm, gender, search,
    attnBelow, attnAbove,
    sortBy = 'name', sortDir = 'asc',
    page = '1', limit = '50',
  } = req.query;

  // Validate sort params
  if (sortBy && !VALID_SORT_COLS.includes(sortBy))
    return fail(res, 400, `sortBy must be one of: ${VALID_SORT_COLS.join(', ')}.`);
  if (sortDir && !VALID_ATTN_SORT.includes(sortDir))
    return fail(res, 400, 'sortDir must be asc or desc.');

  const pageNum  = Math.max(1, parseInt(page,  10) || 1);
  const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));

  // Filter
  let list = db.students.filter(s => {
    if (!s.active) return false;
    if (cls    && s.class  !== cls)    return false;
    if (arm    && s.arm    !== arm)    return false;
    if (gender && s.gender !== gender) return false;
    if (attnBelow != null && s.attendance >= Number(attnBelow)) return false;
    if (attnAbove != null && s.attendance <  Number(attnAbove)) return false;
    if (search) {
      const q = search.toLowerCase();
      const haystack = `${s.name} ${s.id} ${s.parent ?? ''} ${s.class}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });

  // Sort
  const dir = sortDir === 'desc' ? -1 : 1;
  list.sort((a, b) => {
    const va = a[sortBy] ?? '', vb = b[sortBy] ?? '';
    return (typeof va === 'number' ? va - vb : String(va).localeCompare(String(vb))) * dir;
  });

  const total = list.length;
  const data  = list.slice((pageNum - 1) * limitNum, pageNum * limitNum);

  return ok(res, data, {
    total,
    page:       pageNum,
    limit:      limitNum,
    totalPages: Math.ceil(total / limitNum),
  });
};

// ── GET /api/students/:id ─────────────────────────────────────────────────────

exports.getOne = (req, res) => {
  const student = db.findStudent(req.params.id);
  if (!student) return fail(res, 404, 'Student not found.');

  const { role, wardId } = req.user;

  if (role === 'Parent') {
    if (wardId !== student.id)
      return fail(res, 403, 'Access denied.');
    return ok(res, student);
  }

  if (role === 'Teacher') {
    if (!teacherCanAccess(req, res, student)) return;
  }

  return ok(res, student);
};

// ── GET /api/students/:id/summary ─────────────────────────────────────────────

/**
 * Returns aggregated result stats for the student across a term/session.
 * Query: term (required), session (required)
 */
exports.getSummary = (req, res) => {
  const student = db.findStudent(req.params.id);
  if (!student) return fail(res, 404, 'Student not found.');

  if (req.user.role === 'Teacher' && !teacherCanAccess(req, res, student)) return;

  const { term, session } = req.query;
  if (!term || !session)
    return fail(res, 400, 'term and session query parameters are required.');

  const results = db.resultsForStudent(student.id, term, session);
  const summary = db.studentTermSummary(student.id, term, session);

  return ok(res, {
    student,
    term,
    session,
    results,
    summary,
  });
};

// ── POST /api/students ────────────────────────────────────────────────────────

exports.create = (req, res) => {
  const { id, name, class: cls, arm, gender, attendance, dob, parent, phone } = req.body ?? {};

  // Required fields
  const missing = ['id', 'name', 'class', 'arm'].filter(f => !req.body?.[f]);
  if (missing.length)
    return fail(res, 400, `Missing required fields: ${missing.join(', ')}.`);

  if (gender && !VALID_GENDERS.includes(gender))
    return fail(res, 400, `gender must be one of: ${VALID_GENDERS.join(', ')}.`);

  if (db.findStudent(id))
    return fail(res, 409, `Student ID "${id}" already exists.`);

  if (!db.classArmExists(cls, arm)) {
    const cls_obj  = db.findClass(cls);
    if (!cls_obj) return fail(res, 400, `Class "${cls}" does not exist.`);
    return fail(res, 400,
      `Arm "${arm}" does not exist in "${cls}". Valid arms: ${cls_obj.arms.join(', ')}.`);
  }

  let attn = 100;
  if (attendance != null) {
    try { attn = parseAttendance(attendance); }
    catch (e) { return fail(res, 400, e.message); }
  }

  try {
    const student = db.createStudent({
      id:         String(id).trim(),
      name:       String(name).trim(),
      class:      cls,
      arm,
      gender:     gender ?? 'Male',
      attendance: attn,
      dob:        dob    ?? '',
      parent:     parent ?? '',
      phone:      phone  ?? '',
    });
    return ok(res, student, {}, 201);
  } catch (e) {
    return fail(res, 400, e.message);
  }
};

// ── POST /api/students/bulk ───────────────────────────────────────────────────

/**
 * Body: { class, arm, students: [{ name, gender?, dob?, parent?, phone? }] }
 * Returns a summary of created / skipped rows.
 */
exports.bulkCreate = (req, res) => {
  const { class: cls, arm, students: rows } = req.body ?? {};

  if (!cls || !arm)
    return fail(res, 400, 'class and arm are required for bulk import.');

  if (!Array.isArray(rows) || rows.length === 0)
    return fail(res, 400, 'students must be a non-empty array.');

  if (rows.length > 200)
    return fail(res, 400, 'Bulk import is limited to 200 students per request.');

  if (!db.classArmExists(cls, arm)) {
    const cls_obj = db.findClass(cls);
    if (!cls_obj) return fail(res, 400, `Class "${cls}" does not exist.`);
    return fail(res, 400,
      `Arm "${arm}" does not exist in "${cls}". Valid arms: ${cls_obj.arms.join(', ')}.`);
  }

  const created = [];
  const skipped = [];

  rows.forEach((row, i) => {
    const name = String(row.name ?? '').trim();
    if (!name) { skipped.push({ row: i + 1, reason: 'name is required.' }); return; }

    const gender = row.gender ?? 'Male';
    if (!VALID_GENDERS.includes(gender)) {
      skipped.push({ row: i + 1, reason: `Invalid gender "${gender}".` }); return;
    }

    try {
      // Generate a collision-free ID
      const existing = new Set(db.students.map(s => s.id));
      let n = db.students.length + 1;
      let newId;
      do { newId = `SHC/${String(n).padStart(3, '0')}`; n++; } while (existing.has(newId));

      const student = db.createStudent({
        id:     newId,
        name,
        class:  cls,
        arm,
        gender,
        attendance: 100,
        dob:    row.dob    ?? '',
        parent: row.parent ?? '',
        phone:  row.phone  ?? '',
      });
      created.push(student);
    } catch (e) {
      skipped.push({ row: i + 1, reason: e.message });
    }
  });

  return ok(res, created, {
    imported: created.length,
    skipped:  skipped.length,
    errors:   skipped,
  }, 201);
};

// ── PUT /api/students/:id ─────────────────────────────────────────────────────

exports.update = (req, res) => {
  const student = db.findStudent(req.params.id);
  if (!student) return fail(res, 404, 'Student not found.');

  const { class: cls, arm, gender, attendance, name, dob, parent, phone } = req.body ?? {};

  // Validate class/arm if either is being changed
  const newClass = cls ?? student.class;
  const newArm   = arm ?? student.arm;

  if ((cls || arm) && !db.classArmExists(newClass, newArm)) {
    const cls_obj = db.findClass(newClass);
    if (!cls_obj) return fail(res, 400, `Class "${newClass}" does not exist.`);
    return fail(res, 400,
      `Arm "${newArm}" does not exist in "${newClass}". Valid arms: ${cls_obj.arms.join(', ')}.`);
  }

  if (gender && !VALID_GENDERS.includes(gender))
    return fail(res, 400, `gender must be one of: ${VALID_GENDERS.join(', ')}.`);

  if (attendance != null) {
    try { parseAttendance(attendance); }
    catch (e) { return fail(res, 400, e.message); }
  }

  // Apply whitelisted updates only — never allow id mutation
  const patch = {};
  if (name  != null) patch.name       = String(name).trim();
  if (cls   != null) patch.class      = cls;
  if (arm   != null) patch.arm        = arm;
  if (gender != null) patch.gender    = gender;
  if (dob   != null) patch.dob        = dob;
  if (parent != null) patch.parent    = String(parent).trim();
  if (phone  != null) patch.phone     = String(phone).trim();
  if (attendance != null) patch.attendance = parseAttendance(attendance);

  try {
    const updated = db.updateUser
      ? Object.assign(student, patch)   // db.js exposes direct mutation here
      : Object.assign(student, patch);
    return ok(res, updated);
  } catch (e) {
    return fail(res, 400, e.message);
  }
};

// ── PATCH /api/students/:id/transfer ─────────────────────────────────────────

/**
 * Body: { class, arm }
 * Moves a student to a different class/arm.
 */
exports.transfer = (req, res) => {
  const student = db.findStudent(req.params.id);
  if (!student) return fail(res, 404, 'Student not found.');

  const { class: cls, arm } = req.body ?? {};
  if (!cls || !arm)
    return fail(res, 400, 'class and arm are required for transfer.');

  if (!db.classArmExists(cls, arm)) {
    const cls_obj = db.findClass(cls);
    if (!cls_obj) return fail(res, 400, `Class "${cls}" does not exist.`);
    return fail(res, 400,
      `Arm "${arm}" does not exist in "${cls}". Valid arms: ${cls_obj.arms.join(', ')}.`);
  }

  if (student.class === cls && student.arm === arm)
    return fail(res, 400, `Student is already in ${cls} ${arm}.`);

  const from = `${student.class} ${student.arm}`;
  student.class = cls;
  student.arm   = arm;

  return ok(res, student, {
    message: `${student.name} transferred from ${from} → ${cls} ${arm}.`,
  });
};

// ── PATCH /api/students/:id/attendance ───────────────────────────────────────

/**
 * Body: { attendance: number 0–100 }
 * Admin or Teacher (own class only).
 */
exports.updateAttendance = (req, res) => {
  const student = db.findStudent(req.params.id);
  if (!student) return fail(res, 404, 'Student not found.');

  if (req.user.role === 'Teacher' && !teacherCanAccess(req, res, student)) return;

  const { attendance } = req.body ?? {};
  if (attendance == null)
    return fail(res, 400, 'attendance is required.');

  let attn;
  try { attn = parseAttendance(attendance); }
  catch (e) { return fail(res, 400, e.message); }

  try {
    const updated = db.updateAttendance(student.id, attn);
    return ok(res, updated);
  } catch (e) {
    return fail(res, 400, e.message);
  }
};

// ── DELETE /api/students/:id ──────────────────────────────────────────────────

exports.remove = (req, res) => {
  const student = db.findStudent(req.params.id);
  if (!student) return fail(res, 404, 'Student not found.');

  // Soft-delete via db
  student.active = false;

  // Cascade: remove linked results
  const before = db.results.length;
  db.results.splice(0, db.results.length,
    ...db.results.filter(r => r.studentId !== student.id));
  const removed = before - db.results.length;

  return ok(res, student, {
    message: `"${student.name}" deactivated with ${removed} result record(s) removed.`,
    resultsRemoved: removed,
  });
};