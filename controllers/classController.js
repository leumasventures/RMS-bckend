'use strict';

/**
 * classController.js — Sacred Heart College (SAHARCO)
 *
 * Routes (wired in classRoutes.js):
 *   GET    /api/classes                      getAll
 *   GET    /api/classes/:name                getOne
 *   POST   /api/classes                      create          ← was missing
 *   PUT    /api/classes/:name                update          ← was missing
 *   DELETE /api/classes/:name                remove          ← was missing
 *   GET    /api/classes/:name/arms           getArms
 *   POST   /api/classes/:name/arms           addArm          ← was missing
 *   PATCH  /api/classes/:name/arms/:arm      renameArm       ← was missing
 *   DELETE /api/classes/:name/arms/:arm      deleteArm       ← was missing
 *   GET    /api/classes/:name/students       getStudents
 *   GET    /api/classes/:name/summary        getSummary
 *   PATCH  /api/classes/:name/assign-teacher assignTeacher   ← was missing
 *
 * VALID_LEVELS mirrors CLASS_TIERS keys in script2.js exactly.
 */

const db = require('../config/db');

/* ─── constants ─────────────────────────────────────────────────────────── */

const VALID_LEVELS = ['Day Care', 'Nursery', 'Primary', 'Junior', 'Senior'];

/* ─── helpers ────────────────────────────────────────────────────────────── */

const fail = (res, status, msg, extra = {}) =>
  res.status(status).json({ success: false, message: msg, ...extra });

const ok = (res, data, meta = {}, status = 200) =>
  res.status(status).json({ success: true, ...meta, data });

function decodeParam(param) {
  if (!param) return null;
  return decodeURIComponent(String(param)).trim() || null;
}

/**
 * Resolve a class from req.params.name.
 * Returns { cls } or sends 404 and returns null.
 */
function resolveClass(req, res) {
  const name = decodeParam(req.params.name);
  if (!name) { fail(res, 400, 'Class name is required.'); return null; }
  const cls = db.findClass(name);
  if (!cls) { fail(res, 404, `Class "${name}" not found.`); return null; }
  return { cls };
}

/**
 * Enforce teacher-scoped access.
 * Teacher may only access their assigned class (and optional arm).
 */
function assertTeacherAccess(req, res, className, arm) {
  const { role, assignedClass, assignedArm } = req.user;
  if (role !== 'Teacher') return true;

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

/* ═══════════════════════════════════════════════════════════════════════════
   GET /api/classes
   Query: level, search
═══════════════════════════════════════════════════════════════════════════ */
exports.getAll = (req, res) => {
  const { level, search } = req.query;

  let data = [...(db.classes || [])];

  if (level) {
    if (!VALID_LEVELS.includes(level))
      return fail(res, 400, `level must be one of: ${VALID_LEVELS.join(', ')}.`);
    data = data.filter(c => c.level === level);
  }

  if (search) {
    const q = search.toLowerCase();
    data = data.filter(c => (c.name || '').toLowerCase().includes(q));
  }

  // Attach live student count per class
  data = data.map(c => ({
    ...c,
    studentCount: (db.students || []).filter(s => s.class === c.name && s.active !== false).length,
  }));

  return ok(res, data, { total: data.length });
};

/* ═══════════════════════════════════════════════════════════════════════════
   GET /api/classes/:name
═══════════════════════════════════════════════════════════════════════════ */
exports.getOne = (req, res) => {
  const resolved = resolveClass(req, res);
  if (!resolved) return;

  const { cls } = resolved;
  const armStats = (cls.arms || []).map(arm => ({
    arm,
    studentCount: (db.students || []).filter(s => s.class === cls.name && s.arm === arm && s.active !== false).length,
  }));

  return ok(res, { ...cls, armStats });
};

/* ═══════════════════════════════════════════════════════════════════════════
   POST /api/classes
   Body: { name*, level*, arms: [string] }
   Mirrors apiSaveClass() in api-bridge.js and openClassModal form submit.
═══════════════════════════════════════════════════════════════════════════ */
exports.create = (req, res) => {
  const { name, level, arms = [] } = req.body;

  if (!name  || !String(name).trim())  return fail(res, 400, 'name is required.');
  if (!level)                           return fail(res, 400, 'level is required.');
  if (!VALID_LEVELS.includes(level))    return fail(res, 400, `level must be one of: ${VALID_LEVELS.join(', ')}.`);

  const normalName = String(name).trim();

  if ((db.classes || []).some(c => c.name.toLowerCase() === normalName.toLowerCase()))
    return fail(res, 409, `A class named "${normalName}" already exists.`);

  if (!Array.isArray(arms) || arms.length === 0)
    return fail(res, 400, 'At least one arm is required.');

  // Deduplicate and uppercase
  const cleanArms = [...new Set(arms.map(a => String(a).trim().toUpperCase()))].filter(Boolean);
  if (!cleanArms.length) return fail(res, 400, 'At least one valid arm is required.');

  if (!db.classes) db.classes = [];

  const cls = {
    id:    db.nextId ? db.nextId() : Date.now(),
    name:  normalName,
    level,
    arms:  cleanArms,
  };

  db.classes.push(cls);
  return ok(res, cls, {}, 201);
};

/* ═══════════════════════════════════════════════════════════════════════════
   PUT /api/classes/:name
   Body: { name?, level?, arms? }
   Cascades name change to students and teachers.
═══════════════════════════════════════════════════════════════════════════ */
exports.update = (req, res) => {
  const resolved = resolveClass(req, res);
  if (!resolved) return;

  const { cls }    = resolved;
  const oldName    = cls.name;
  const { name: newName, level, arms } = req.body;

  if (level && !VALID_LEVELS.includes(level))
    return fail(res, 400, `level must be one of: ${VALID_LEVELS.join(', ')}.`);

  if (newName && String(newName).trim().toLowerCase() !== oldName.toLowerCase()) {
    const trimmed = String(newName).trim();
    if ((db.classes || []).some(c => c.name.toLowerCase() === trimmed.toLowerCase() && c.id !== cls.id))
      return fail(res, 409, `A class named "${trimmed}" already exists.`);
    cls.name = trimmed;
  }

  if (level) cls.level = level;

  if (Array.isArray(arms)) {
    if (arms.length === 0) return fail(res, 400, 'At least one arm is required.');
    cls.arms = [...new Set(arms.map(a => String(a).trim().toUpperCase()))].filter(Boolean);
  }

  // Cascade name change
  if (cls.name !== oldName) {
    (db.students || []).forEach(s => { if (s.class === oldName) s.class = cls.name; });
    (db.staff    || []).forEach(t => { if (t.classUnit === oldName || t.class === oldName) { t.classUnit = cls.name; t.class = cls.name; t.assignedClass = cls.name; } });
    (db.teachers || []).forEach(t => { if (t.assignedClass === oldName || t.class === oldName) { t.assignedClass = cls.name; t.class = cls.name; } });
  }

  return ok(res, cls);
};

/* ═══════════════════════════════════════════════════════════════════════════
   DELETE /api/classes/:name
   Blocked if students are enrolled (mirrors confirmDeleteClass guard).
═══════════════════════════════════════════════════════════════════════════ */
exports.remove = (req, res) => {
  const resolved = resolveClass(req, res);
  if (!resolved) return;

  const { cls } = resolved;
  const enrolled = (db.students || []).filter(s => s.class === cls.name && s.active !== false).length;

  if (enrolled > 0)
    return fail(res, 400,
      `Cannot delete "${cls.name}" — ${enrolled} student(s) are enrolled. Re-assign them first.`);

  // Clear teacher assignments
  (db.staff    || []).forEach(t => { if (t.classUnit === cls.name || t.class === cls.name) { t.classUnit = ''; t.class = ''; t.assignedClass = ''; } });
  (db.teachers || []).forEach(t => { if (t.assignedClass === cls.name) { t.assignedClass = ''; t.class = ''; } });

  db.classes = (db.classes || []).filter(c => c.id !== cls.id);
  return ok(res, cls, { message: `Class "${cls.name}" deleted.` });
};

/* ═══════════════════════════════════════════════════════════════════════════
   GET /api/classes/:name/arms
═══════════════════════════════════════════════════════════════════════════ */
exports.getArms = (req, res) => {
  const resolved = resolveClass(req, res);
  if (!resolved) return;
  return ok(res, resolved.cls.arms || [], { total: (resolved.cls.arms || []).length });
};

/* ═══════════════════════════════════════════════════════════════════════════
   POST /api/classes/:name/arms
   Body: { arm?: string, arms?: string[] }
   Mirrors apiAddArm() in api-bridge.js.
═══════════════════════════════════════════════════════════════════════════ */
exports.addArm = (req, res) => {
  const resolved = resolveClass(req, res);
  if (!resolved) return;

  const { cls } = resolved;
  if (!cls.arms) cls.arms = [];

  // Accept single arm or array
  let incoming = [];
  if (Array.isArray(req.body.arms))  incoming = req.body.arms;
  else if (req.body.arm)              incoming = [req.body.arm];
  else if (typeof req.body === 'object') {
    // Might be { A: true } style — unlikely but guard
    incoming = [];
  }

  incoming = incoming.map(a => String(a).trim().toUpperCase()).filter(Boolean);
  if (!incoming.length) return fail(res, 400, 'At least one arm name is required.');

  const invalid  = incoming.filter(a => !/^[A-Z0-9]{1,5}$/.test(a));
  if (invalid.length) return fail(res, 400, `Invalid arm name(s): ${invalid.join(', ')}. Use 1-5 letters or digits.`);

  const dupes = incoming.filter(a => cls.arms.includes(a));
  if (dupes.length) return fail(res, 409, `Arm(s) already exist: ${dupes.join(', ')}.`);

  cls.arms.push(...incoming);
  return ok(res, cls.arms, { added: incoming, total: cls.arms.length }, 201);
};

/* ═══════════════════════════════════════════════════════════════════════════
   PATCH /api/classes/:name/arms/:arm
   Body: { new_name* }
   Cascades rename to students and teachers. Mirrors apiRenameArm().
═══════════════════════════════════════════════════════════════════════════ */
exports.renameArm = (req, res) => {
  const resolved = resolveClass(req, res);
  if (!resolved) return;

  const { cls }   = resolved;
  const oldArm    = decodeParam(req.params.arm);
  const newName   = String(req.body.new_name || req.body.newName || '').trim().toUpperCase();

  if (!oldArm) return fail(res, 400, 'Arm parameter is required.');
  if (!cls.arms || !cls.arms.includes(oldArm))
    return fail(res, 404, `Arm "${oldArm}" does not exist in "${cls.name}".`);
  if (!newName)  return fail(res, 400, 'new_name is required.');
  if (!/^[A-Z0-9]{1,5}$/.test(newName)) return fail(res, 400, 'new_name must be 1-5 letters or digits.');
  if (cls.arms.includes(newName) && newName !== oldArm)
    return fail(res, 409, `Arm "${newName}" already exists in "${cls.name}".`);

  if (newName === oldArm) return ok(res, cls.arms); // no-op

  cls.arms[cls.arms.indexOf(oldArm)] = newName;

  // Cascade
  (db.students || []).forEach(s => { if (s.class === cls.name && s.arm === oldArm) s.arm = newName; });
  (db.staff    || []).forEach(t => { if ((t.classUnit === cls.name || t.class === cls.name) && t.arm === oldArm) t.arm = newName; });
  (db.teachers || []).forEach(t => { if (t.assignedClass === cls.name && t.assignedArm === oldArm) t.assignedArm = newName; });

  return ok(res, cls.arms, { renamed: { from: oldArm, to: newName } });
};

/* ═══════════════════════════════════════════════════════════════════════════
   DELETE /api/classes/:name/arms/:arm
   Blocked if students are enrolled. Mirrors apiDeleteArm().
═══════════════════════════════════════════════════════════════════════════ */
exports.deleteArm = (req, res) => {
  const resolved = resolveClass(req, res);
  if (!resolved) return;

  const { cls } = resolved;
  const arm     = decodeParam(req.params.arm);

  if (!arm)                            return fail(res, 400, 'Arm parameter is required.');
  if (!cls.arms || !cls.arms.includes(arm))
    return fail(res, 404, `Arm "${arm}" does not exist in "${cls.name}".`);

  const enrolled = (db.students || []).filter(s => s.class === cls.name && s.arm === arm && s.active !== false).length;
  if (enrolled > 0)
    return fail(res, 400,
      `Cannot delete arm "${arm}" — ${enrolled} student(s) are enrolled. Use "Move Students" first.`);

  // Clear teacher arm assignments
  (db.staff    || []).forEach(t => { if ((t.classUnit === cls.name || t.class === cls.name) && t.arm === arm) t.arm = ''; });
  (db.teachers || []).forEach(t => { if (t.assignedClass === cls.name && t.assignedArm === arm) t.assignedArm = ''; });

  cls.arms = cls.arms.filter(a => a !== arm);
  return ok(res, cls.arms, { deleted: arm, total: cls.arms.length });
};

/* ═══════════════════════════════════════════════════════════════════════════
   GET /api/classes/:name/students
   Query: arm
═══════════════════════════════════════════════════════════════════════════ */
exports.getStudents = (req, res) => {
  const resolved = resolveClass(req, res);
  if (!resolved) return;

  const { cls } = resolved;
  const arm     = decodeParam(req.query.arm) ?? undefined;

  if (arm && !(cls.arms || []).includes(arm))
    return fail(res, 400, `Arm "${arm}" does not exist in "${cls.name}". Valid arms: ${(cls.arms || []).join(', ')}.`);

  if (!assertTeacherAccess(req, res, cls.name, arm)) return;

  const effectiveArm = arm ?? (req.user.role === 'Teacher' && req.user.assignedArm ? req.user.assignedArm : undefined);

  const data = (db.students || []).filter(s =>
    s.class === cls.name &&
    (!effectiveArm || s.arm === effectiveArm) &&
    s.active !== false
  );

  return ok(res, data, { total: data.length, class: cls.name, arm: effectiveArm ?? 'all' });
};

/* ═══════════════════════════════════════════════════════════════════════════
   GET /api/classes/:name/summary
   Query: arm?, term*, session*
═══════════════════════════════════════════════════════════════════════════ */
exports.getSummary = (req, res) => {
  const resolved = resolveClass(req, res);
  if (!resolved) return;

  const { cls }               = resolved;
  const arm                   = decodeParam(req.query.arm) ?? undefined;
  const { term, session }     = req.query;

  if (!term || !session)
    return fail(res, 400, 'term and session are required.');

  if (arm && !(cls.arms || []).includes(arm))
    return fail(res, 400, `Arm "${arm}" does not exist in "${cls.name}".`);

  if (!assertTeacherAccess(req, res, cls.name, arm)) return;

  const students = (db.students || []).filter(s =>
    s.class === cls.name && (!arm || s.arm === arm) && s.active !== false
  );

  if (!students.length) {
    return ok(res, {
      class: cls.name, arm: arm ?? 'all', term, session,
      studentCount: 0, attendanceAvg: null,
      results: { recorded: 0, complete: 0, passRate: null },
    });
  }

  const attendanceAvg = +(students.reduce((s, st) => s + (st.attendance ?? 0), 0) / students.length).toFixed(1);

  let totalRecorded = 0, totalComplete = 0, totalPassing = 0;
  students.forEach(s => {
    const results = (db.results || []).filter(r =>
      r.studentId === s.id && r.term === term && r.session === session
    );
    if (!results.length) return;
    totalRecorded++;
    totalComplete++;
    const avg = results.reduce((a, r) => a + (r.total || 0), 0) / results.length;
    if (avg >= 40) totalPassing++;
  });

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
      passRate: totalComplete > 0 ? +((totalPassing / totalComplete) * 100).toFixed(1) : null,
    },
  });
};

/* ═══════════════════════════════════════════════════════════════════════════
   PATCH /api/classes/:name/assign-teacher
   Body: { teacher_id, arm? }
   Mirrors Classes.assignTeacher() in api.js.
═══════════════════════════════════════════════════════════════════════════ */
exports.assignTeacher = (req, res) => {
  const resolved = resolveClass(req, res);
  if (!resolved) return;

  const { cls }         = resolved;
  const { teacher_id, arm } = req.body;

  if (!teacher_id) return fail(res, 400, 'teacher_id is required.');

  if (arm && !(cls.arms || []).includes(arm))
    return fail(res, 400, `Arm "${arm}" does not exist in "${cls.name}".`);

  // Find in either teachers or staff array
  const teacher = (db.staff || []).find(s => s.id === teacher_id)
               || (db.teachers || []).find(t => t.id === teacher_id);

  if (!teacher) return fail(res, 404, `Teacher/staff "${teacher_id}" not found.`);
  if (teacher.category && !['Academic', 'Leadership'].includes(teacher.category))
    return fail(res, 400, 'Only Academic or Leadership staff can be assigned to a class.');

  teacher.classUnit     = cls.name;
  teacher.class         = cls.name;
  teacher.assignedClass = cls.name;
  if (arm) { teacher.arm = arm; teacher.assignedArm = arm; }

  return ok(res, {
    class:   cls.name,
    arm:     arm || null,
    teacher: { id: teacher.id, name: teacher.name },
  }, { message: `${teacher.name} assigned to ${cls.name}${arm ? ' ' + arm : ''}.` });
};