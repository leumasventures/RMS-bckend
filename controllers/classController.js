'use strict';

/**
 * classController.js — Sacred Heart College Eziukwu Aba (SAHARCO)
 * ──────────────────────────────────────────────────────────────────
 * Routes handled:
 *   GET  /api/classes                       → getAll
 *   GET  /api/classes/:name                 → getOne
 *   GET  /api/classes/:name/arms            → getArms
 *   GET  /api/classes/:name/students        → getStudents   ?arm=A
 *   GET  /api/classes/:name/summary         → getSummary    ?arm=A&term=&session=
 */

const db = require('../config/db');

// ── Helpers ───────────────────────────────────────────────────────────────────

const fail = (res, status, message) =>
  res.status(status).json({ success: false, message });

const ok = (res, data, meta = {}) =>
  res.json({ success: true, ...meta, data });

/**
 * Decode and trim a URL parameter; return null if blank.
 * @param {string|undefined} param
 */
function decodeParam(param) {
  if (!param) return null;
  const decoded = decodeURIComponent(param).trim();
  return decoded || null;
}

/**
 * Resolve and validate the class name from req.params.name.
 * Returns { cls } on success or sends a 404 and returns null.
 * @param {import('express').Request}  req
 * @param {import('express').Response} res
 * @returns {{ cls: object } | null}
 */
function resolveClass(req, res) {
  const name = decodeParam(req.params.name);
  if (!name) {
    fail(res, 400, 'Class name parameter is required.');
    return null;
  }
  const cls = db.findClass(name);
  if (!cls) {
    fail(res, 404, `Class "${name}" not found.`);
    return null;
  }
  return { cls };
}

/**
 * Enforce teacher-scoped access.
 * A Teacher may only access their assigned class (and optionally their arm).
 *
 * @param {import('express').Request}  req
 * @param {import('express').Response} res
 * @param {string} className
 * @param {string|undefined} arm  — when present, also checks arm assignment
 * @returns {boolean}  true if access is allowed
 */
function assertTeacherAccess(req, res, className, arm) {
  const { role, assignedClass, assignedArm } = req.user;
  if (role !== 'Teacher') return true;   // Admin / other roles pass through

  if (assignedClass !== className) {
    fail(res, 403, 'Access restricted to your assigned class.');
    return false;
  }

  if (arm && assignedArm && assignedArm !== arm) {
    fail(res, 403, 'Access restricted to your assigned arm.');
    return false;
  }

  return true;
}

// ── Controllers ───────────────────────────────────────────────────────────────

/**
 * GET /api/classes
 * Returns all classes, optionally filtered by level.
 * Query: level=Junior|Senior
 */
exports.getAll = (req, res) => {
  const { level } = req.query;

  let data = db.classes;

  if (level) {
    const normalised = String(level).trim();
    const allowed    = ['Junior', 'Senior'];
    if (!allowed.includes(normalised)) {
      return fail(res, 400, `level must be one of: ${allowed.join(', ')}.`);
    }
    data = data.filter(c => c.level === normalised);
  }

  return ok(res, data, { total: data.length });
};

/**
 * GET /api/classes/:name
 * Returns full detail for a single class including arm list.
 */
exports.getOne = (req, res) => {
  const resolved = resolveClass(req, res);
  if (!resolved) return;

  const { cls } = resolved;

  // Attach live student count per arm for convenience
  const armStats = cls.arms.map(arm => ({
    arm,
    studentCount: db.studentsInClass(cls.name, arm).length,
  }));

  return ok(res, { ...cls, armStats });
};

/**
 * GET /api/classes/:name/arms
 * Returns just the arm list for a class.
 * Useful for populating dropdowns.
 */
exports.getArms = (req, res) => {
  const resolved = resolveClass(req, res);
  if (!resolved) return;

  const { cls } = resolved;
  return ok(res, cls.arms, { total: cls.arms.length });
};

/**
 * GET /api/classes/:name/students
 * Query: arm (optional — if omitted, returns all arms the requester can access)
 *
 * Role rules:
 *   Admin   → any class, any arm
 *   Teacher → own class only; if they have an assigned arm, that arm only
 *   Others  → 403
 */
exports.getStudents = (req, res) => {
  const resolved = resolveClass(req, res);
  if (!resolved) return;

  const { cls }  = resolved;
  const arm      = decodeParam(req.query.arm) ?? undefined;

  // Validate arm if supplied
  if (arm && !cls.arms.includes(arm)) {
    return fail(res, 400, `Arm "${arm}" does not exist in class "${cls.name}". Valid arms: ${cls.arms.join(', ')}.`);
  }

  if (!assertTeacherAccess(req, res, cls.name, arm)) return;

  // If the teacher has a specific arm and no arm was requested, scope to theirs
  const effectiveArm =
    arm ??
    (req.user.role === 'Teacher' && req.user.assignedArm ? req.user.assignedArm : undefined);

  const data = db.studentsInClass(cls.name, effectiveArm);

  return ok(res, data, {
    total: data.length,
    class: cls.name,
    arm:   effectiveArm ?? 'all',
  });
};

/**
 * GET /api/classes/:name/summary
 * Returns attendance and result statistics for a class / arm.
 * Query: arm (optional), term (required), session (required)
 *
 * Response shape:
 * {
 *   class, arm, term, session,
 *   studentCount,
 *   attendanceAvg,
 *   results: { recorded, complete, passRate }
 * }
 */
exports.getSummary = (req, res) => {
  const resolved = resolveClass(req, res);
  if (!resolved) return;

  const { cls }   = resolved;
  const arm       = decodeParam(req.query.arm) ?? undefined;
  const { term, session } = req.query;

  if (!term || !session)
    return fail(res, 400, 'term and session query parameters are required.');

  if (!['First', 'Second', 'Third'].includes(term))
    return fail(res, 400, 'term must be First, Second, or Third.');

  if (!/^\d{4}\/\d{4}$/.test(session))
    return fail(res, 400, 'session must be in the format "YYYY/YYYY" e.g. "2024/2025".');

  if (arm && !cls.arms.includes(arm))
    return fail(res, 400, `Arm "${arm}" does not exist in class "${cls.name}".`);

  if (!assertTeacherAccess(req, res, cls.name, arm)) return;

  const students = db.studentsInClass(cls.name, arm);

  if (!students.length) {
    return ok(res, {
      class: cls.name, arm: arm ?? 'all', term, session,
      studentCount: 0,
      attendanceAvg: null,
      results: { recorded: 0, complete: 0, passRate: null },
    });
  }

  // Attendance average
  const attendanceAvg = +(
    students.reduce((sum, s) => sum + (s.attendance ?? 0), 0) / students.length
  ).toFixed(1);

  // Result statistics
  let totalRecorded = 0;
  let totalComplete = 0;
  let totalPassing  = 0;

  for (const student of students) {
    const summary = db.studentTermSummary(student.id, term, session);
    if (!summary) continue;

    totalRecorded++;
    if (summary.subjectCount > 0) totalComplete++;
    if (summary.average != null && summary.average >= 40) totalPassing++;
  }

  const passRate = totalComplete > 0
    ? +((totalPassing / totalComplete) * 100).toFixed(1)
    : null;

  return ok(res, {
    class:        cls.name,
    arm:          arm ?? 'all',
    term,
    session,
    studentCount: students.length,
    attendanceAvg,
    results: {
      recorded: totalRecorded,
      complete: totalComplete,
      passRate,
    },
  });
};