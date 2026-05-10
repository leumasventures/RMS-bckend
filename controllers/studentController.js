'use strict';

/**
 * studentController.js — Sacred Heart College (SAHARCO)
 *
 * Routes (wired in studentRoutes.js):
 *   GET    /api/students              getAll
 *   GET    /api/students/:id          getOne
 *   GET    /api/students/:id/summary  getSummary
 *   POST   /api/students              create
 *   POST   /api/students/bulk         bulkCreate
 *   PUT    /api/students/:id          update
 *   PATCH  /api/students/:id/transfer          transfer
 *   PATCH  /api/students/:id/attendance        updateAttendance
 *   PATCH  /api/students/:id/status            setStatus
 *   DELETE /api/students/:id          remove
 *   GET    /api/students/export       exportStudents  (CSV)
 *   GET    /api/students/:id/results  getResults
 *   GET    /api/students/:id/attendance getAttendance
 *   GET    /api/students/:id/report-card getReportCard
 *
 * Role matrix:
 *   Admin   → full CRUD + bulk + transfer + export
 *   Teacher → read own class/arm + attendance update
 *   Parent  → read own ward only
 */

const db = require('../config/db');

/* ─── constants ─────────────────────────────────────────────────────────── */
const VALID_GENDERS   = ['Male', 'Female'];
const VALID_STATUSES  = ['active', 'suspended', 'graduated', 'withdrawn', 'transferred'];
const VALID_SORT_COLS = ['name', 'id', 'class', 'arm', 'gender', 'attendance'];

/* ─── helpers ────────────────────────────────────────────────────────────── */

const fail = (res, status, msg, extra = {}) =>
  res.status(status).json({ success: false, message: msg, ...extra });

const ok = (res, data, meta = {}, status = 200) =>
  res.status(status).json({ success: true, ...meta, data });

/** Returns false and sends 403 if a Teacher cannot access this student */
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

/** Parse and validate attendance — returns integer 0–100 or throws */
function parseAttendance(val) {
  const n = Number(val);
  if (isNaN(n) || n < 0 || n > 100)
    throw new Error('attendance must be a number between 0 and 100.');
  return Math.round(n);
}

/** Collision-free SHC/NNN student ID */
function generateStudentId() {
  const existing = new Set((db.students || []).map(s => s.id));
  let n = (db.students || []).length + 1, id;
  do { id = `SHC/${String(n).padStart(3, '0')}`; n++; } while (existing.has(id));
  return id;
}

/* ═══════════════════════════════════════════════════════════════════════════
   GET /api/students
   Query (Admin only): class, arm, gender, search, attnBelow, attnAbove,
                       sortBy, sortDir (asc|desc), page, limit
   Teacher  → own class/arm only.
   Parent   → own ward only.
═══════════════════════════════════════════════════════════════════════════ */
exports.getAll = (req, res) => {
  const { role, assignedClass, assignedArm, wardId } = req.user;

  // ── Parent ────────────────────────────────────────────────────────────────
  if (role === 'Parent') {
    const ward = wardId ? db.findStudent(wardId) : null;
    return ok(res, ward ? [ward] : [], { total: ward ? 1 : 0 });
  }

  // ── Teacher ───────────────────────────────────────────────────────────────
  if (role === 'Teacher') {
    const data = (db.students || []).filter(s =>
      s.class === assignedClass &&
      (!assignedArm || s.arm === assignedArm) &&
      s.active !== false
    );
    return ok(res, data, { total: data.length });
  }

  // ── Admin: full filter + sort + paginate ──────────────────────────────────
  const {
    class: cls, arm, gender, search,
    attnBelow, attnAbove,
    sortBy = 'name', sortDir = 'asc',
    page = '1', limit = '50',
  } = req.query;

  if (sortBy && !VALID_SORT_COLS.includes(sortBy))
    return fail(res, 400, `sortBy must be one of: ${VALID_SORT_COLS.join(', ')}.`);
  if (sortDir && !['asc', 'desc'].includes(sortDir))
    return fail(res, 400, 'sortDir must be asc or desc.');

  const pageNum  = Math.max(1, parseInt(page,  10) || 1);
  const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));

  let list = (db.students || []).filter(s => {
    if (s.active === false) return false;
    if (cls    && s.class  !== cls)    return false;
    if (arm    && s.arm    !== arm)    return false;
    if (gender && s.gender !== gender) return false;
    if (attnBelow != null && s.attendance >= Number(attnBelow)) return false;
    if (attnAbove != null && s.attendance <  Number(attnAbove)) return false;
    if (search) {
      const q = search.toLowerCase();
      if (![s.name, s.id, s.parent ?? '', s.class].join(' ').toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const dir = sortDir === 'desc' ? -1 : 1;
  list.sort((a, b) => {
    const va = a[sortBy] ?? '', vb = b[sortBy] ?? '';
    return (typeof va === 'number' ? va - vb : String(va).localeCompare(String(vb))) * dir;
  });

  const total = list.length;
  return ok(res, list.slice((pageNum - 1) * limitNum, pageNum * limitNum), {
    total, page: pageNum, limit: limitNum,
    totalPages: Math.ceil(total / limitNum),
  });
};

/* ═══════════════════════════════════════════════════════════════════════════
   GET /api/students/:id
═══════════════════════════════════════════════════════════════════════════ */
exports.getOne = (req, res) => {
  const student = db.findStudent(req.params.id);
  if (!student) return fail(res, 404, 'Student not found.');

  if (req.user.role === 'Parent') {
    if (req.user.wardId !== student.id) return fail(res, 403, 'Access denied.');
    return ok(res, student);
  }

  if (req.user.role === 'Teacher' && !teacherCanAccess(req, res, student)) return;
  return ok(res, student);
};

/* ═══════════════════════════════════════════════════════════════════════════
   GET /api/students/:id/summary
   Query: term*, session*
   Returns aggregated result stats + attendance summary.
   Used by viewStudent profile tab and parent portal.
═══════════════════════════════════════════════════════════════════════════ */
exports.getSummary = (req, res) => {
  const student = db.findStudent(req.params.id);
  if (!student) return fail(res, 404, 'Student not found.');

  if (req.user.role === 'Parent' && req.user.wardId !== student.id) return fail(res, 403, 'Access denied.');
  if (req.user.role === 'Teacher' && !teacherCanAccess(req, res, student)) return;

  const { term, session } = req.query;
  if (!term || !session) return fail(res, 400, 'term and session are required.');

  const results = (db.results || []).filter(r =>
    r.studentId === student.id && r.term === term && r.session === session
  );

  const subjectCount = results.length;
  const total        = results.reduce((s, r) => s + (r.total || 0), 0);
  const average      = subjectCount ? parseFloat((total / subjectCount).toFixed(1)) : null;

  const attRecords = (db.attendance || []).filter(r =>
    r.studentId === student.id && r.term === term && r.session === session
  );
  const present = attRecords.filter(r => (r.status || '').toLowerCase() === 'p').length;
  const absent  = attRecords.filter(r => (r.status || '').toLowerCase() === 'a').length;
  const late    = attRecords.filter(r => (r.status || '').toLowerCase() === 'l').length;

  return ok(res, {
    student, term, session,
    results,
    summary: {
      subjectCount,
      totalScore:  total,
      average,
      present, absent, late,
      attendancePct: attRecords.length
        ? parseFloat((present / attRecords.length * 100).toFixed(1))
        : student.attendance ?? 100,
    },
  });
};

/* ═══════════════════════════════════════════════════════════════════════════
   POST /api/students
   Body: { id?, name*, class*, arm*, gender, attendance, dob, parent, phone }
   If id is omitted, one is auto-generated (SHC/NNN).
═══════════════════════════════════════════════════════════════════════════ */
exports.create = (req, res) => {
  const { id: rawId, name, class: cls, arm, gender, attendance, dob, parent, phone } = req.body ?? {};

  const missing = ['name', 'class', 'arm'].filter(f => !req.body?.[f]);
  if (missing.length) return fail(res, 400, `Missing required fields: ${missing.join(', ')}.`);

  if (gender && !VALID_GENDERS.includes(gender))
    return fail(res, 400, `gender must be one of: ${VALID_GENDERS.join(', ')}.`);

  // Class + arm validation
  const clsObj = db.findClass(cls);
  if (!clsObj) return fail(res, 400, `Class "${cls}" does not exist.`);
  if (clsObj.arms && !clsObj.arms.includes(arm))
    return fail(res, 400, `Arm "${arm}" does not exist in "${cls}". Valid arms: ${clsObj.arms.join(', ')}.`);

  const id = rawId ? String(rawId).trim() : generateStudentId();

  if ((db.students || []).find(s => s.id === id))
    return fail(res, 409, `Student ID "${id}" already exists.`);

  let attn = 100;
  if (attendance != null) {
    try { attn = parseAttendance(attendance); } catch (e) { return fail(res, 400, e.message); }
  }

  const student = {
    id,
    name:       String(name).trim(),
    class:      cls,
    arm,
    gender:     gender ?? 'Male',
    dob:        dob    ?? '',
    parent:     parent ?? '',
    phone:      phone  ?? '',
    attendance: attn,
    active:     true,
  };

  if (!db.students) db.students = [];
  db.students.push(student);
  return ok(res, student, {}, 201);
};

/* ═══════════════════════════════════════════════════════════════════════════
   POST /api/students/bulk
   Body: { class*, arm*, students: [{ name*, gender?, dob?, parent?, phone? }] }
   Mirrors apiBulkAddStudents() in api-bridge.js.
═══════════════════════════════════════════════════════════════════════════ */
exports.bulkCreate = (req, res) => {
  const { class: cls, arm, students: rows } = req.body ?? {};
  if (!cls || !arm)    return fail(res, 400, 'class and arm are required.');
  if (!Array.isArray(rows) || !rows.length) return fail(res, 400, 'students must be a non-empty array.');
  if (rows.length > 200) return fail(res, 400, 'Bulk import is limited to 200 students per request.');

  const clsObj = db.findClass(cls);
  if (!clsObj) return fail(res, 400, `Class "${cls}" does not exist.`);
  if (clsObj.arms && !clsObj.arms.includes(arm))
    return fail(res, 400, `Arm "${arm}" does not exist in "${cls}". Valid arms: ${clsObj.arms.join(', ')}.`);

  if (!db.students) db.students = [];
  const created = [], skipped = [];

  rows.forEach((row, i) => {
    const name = String(row.name ?? '').trim();
    if (!name) { skipped.push({ row: i + 1, reason: 'name is required.' }); return; }

    const gender = row.gender ?? 'Male';
    if (!VALID_GENDERS.includes(gender)) { skipped.push({ row: i + 1, reason: `Invalid gender "${gender}".` }); return; }

    const id = generateStudentId();
    const student = {
      id, name, class: cls, arm, gender,
      dob:        row.dob    ?? '',
      parent:     row.parent ?? '',
      phone:      row.phone  ?? '',
      attendance: 100,
      active:     true,
    };
    db.students.push(student);
    created.push(student);
  });

  return ok(res, created, { imported: created.length, skipped: skipped.length, errors: skipped }, 201);
};

/* ═══════════════════════════════════════════════════════════════════════════
   PUT /api/students/:id
═══════════════════════════════════════════════════════════════════════════ */
exports.update = (req, res) => {
  const student = db.findStudent(req.params.id);
  if (!student) return fail(res, 404, 'Student not found.');

  const { class: cls, arm, gender, attendance, name, dob, parent, phone } = req.body ?? {};

  const newClass = cls ?? student.class;
  const newArm   = arm ?? student.arm;

  if (cls || arm) {
    const clsObj = db.findClass(newClass);
    if (!clsObj) return fail(res, 400, `Class "${newClass}" does not exist.`);
    if (clsObj.arms && !clsObj.arms.includes(newArm))
      return fail(res, 400, `Arm "${newArm}" does not exist in "${newClass}". Valid arms: ${clsObj.arms.join(', ')}.`);
  }

  if (gender && !VALID_GENDERS.includes(gender))
    return fail(res, 400, `gender must be one of: ${VALID_GENDERS.join(', ')}.`);

  const patch = {};
  if (name  != null) patch.name       = String(name).trim();
  if (cls   != null) patch.class      = cls;
  if (arm   != null) patch.arm        = arm;
  if (gender != null) patch.gender    = gender;
  if (dob   != null) patch.dob        = dob;
  if (parent != null) patch.parent    = String(parent).trim();
  if (phone  != null) patch.phone     = String(phone).trim();
  if (attendance != null) {
    try { patch.attendance = parseAttendance(attendance); } catch (e) { return fail(res, 400, e.message); }
  }

  Object.assign(student, patch);
  return ok(res, student);
};

/* ═══════════════════════════════════════════════════════════════════════════
   PATCH /api/students/:id/transfer
   Body: { class, arm }
   Mirrors apiTransferStudent() in api-bridge.js.
═══════════════════════════════════════════════════════════════════════════ */
exports.transfer = (req, res) => {
  const student = db.findStudent(req.params.id);
  if (!student) return fail(res, 404, 'Student not found.');

  // Accept both class/class_id field names
  const cls = req.body.class || req.body.class_id;
  const arm = req.body.arm   || req.body.new_arm;
  if (!cls || !arm) return fail(res, 400, 'class and arm are required for transfer.');

  const clsObj = db.findClass(cls);
  if (!clsObj) return fail(res, 400, `Class "${cls}" does not exist.`);
  if (clsObj.arms && !clsObj.arms.includes(arm))
    return fail(res, 400, `Arm "${arm}" does not exist in "${cls}". Valid arms: ${clsObj.arms.join(', ')}.`);

  if (student.class === cls && student.arm === arm)
    return fail(res, 400, `Student is already in ${cls} ${arm}.`);

  const from   = `${student.class} ${student.arm}`;
  student.class = cls;
  student.arm   = arm;

  return ok(res, student, { message: `${student.name} transferred from ${from} → ${cls} ${arm}.` });
};

/* ═══════════════════════════════════════════════════════════════════════════
   PATCH /api/students/:id/attendance
   Body: { attendance: 0–100 }
═══════════════════════════════════════════════════════════════════════════ */
exports.updateAttendance = (req, res) => {
  const student = db.findStudent(req.params.id);
  if (!student) return fail(res, 404, 'Student not found.');

  if (req.user.role === 'Teacher' && !teacherCanAccess(req, res, student)) return;

  const { attendance } = req.body ?? {};
  if (attendance == null) return fail(res, 400, 'attendance is required.');

  let attn;
  try { attn = parseAttendance(attendance); } catch (e) { return fail(res, 400, e.message); }

  student.attendance = attn;
  return ok(res, student);
};

/* ═══════════════════════════════════════════════════════════════════════════
   PATCH /api/students/:id/status
   Body: { status: 'active'|'suspended'|'graduated'|'withdrawn'|'transferred' }
   Matches API.Students.setStatus() in api.js.
═══════════════════════════════════════════════════════════════════════════ */
exports.setStatus = (req, res) => {
  const { status } = req.body ?? {};
  if (!status || !VALID_STATUSES.includes(status))
    return fail(res, 400, `status must be one of: ${VALID_STATUSES.join(', ')}.`);

  const student = db.findStudent(req.params.id);
  if (!student) return fail(res, 404, 'Student not found.');

  student.active = (status === 'active');
  student.status = status;
  return ok(res, student);
};

/* ═══════════════════════════════════════════════════════════════════════════
   DELETE /api/students/:id
   Soft-deletes; cascades to results.
═══════════════════════════════════════════════════════════════════════════ */
exports.remove = (req, res) => {
  const student = db.findStudent(req.params.id);
  if (!student) return fail(res, 404, 'Student not found.');

  student.active = false;
  student.status = 'withdrawn';

  const before = (db.results || []).length;
  if (db.results) {
    db.results.splice(0, db.results.length,
      ...db.results.filter(r => r.studentId !== student.id));
  }
  const removed = before - (db.results || []).length;

  return ok(res, student, {
    message: `"${student.name}" deactivated with ${removed} result record(s) removed.`,
    resultsRemoved: removed,
  });
};

/* ═══════════════════════════════════════════════════════════════════════════
   GET /api/students/export
   Query: class, arm, sessionId, format (csv)
   Column order matches exportStudentsCSV() in api-bridge.js.
═══════════════════════════════════════════════════════════════════════════ */
exports.exportStudents = (req, res) => {
  const { class: cls, arm } = req.query;

  let list = (db.students || []).filter(s => s.active !== false);
  if (cls) list = list.filter(s => s.class === cls);
  if (arm) list = list.filter(s => s.arm   === arm);

  const headers = ['Student ID', 'Name', 'Class', 'Arm', 'Gender', 'DOB', 'Parent', 'Phone', 'Attendance %'];
  const rows    = list.map(s => [s.id, s.name, s.class, s.arm, s.gender, s.dob ?? '', s.parent ?? '', s.phone ?? '', s.attendance ?? 0]);

  const csv = [headers, ...rows]
    .map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\r\n');

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="students_export.csv"');
  return res.send('\uFEFF' + csv);
};

/* ═══════════════════════════════════════════════════════════════════════════
   GET /api/students/:id/results
   Query: termId, sessionId, subjectId
   Used by viewStudent profile Results tab and parent portal.
═══════════════════════════════════════════════════════════════════════════ */
exports.getResults = (req, res) => {
  const student = db.findStudent(req.params.id);
  if (!student) return fail(res, 404, 'Student not found.');

  if (req.user.role === 'Parent' && req.user.wardId !== student.id) return fail(res, 403, 'Access denied.');
  if (req.user.role === 'Teacher' && !teacherCanAccess(req, res, student)) return;

  const { termId, sessionId, subjectId } = req.query;

  let results = (db.results || []).filter(r => r.studentId === student.id);
  if (termId)    results = results.filter(r => r.term    === termId    || r.termId    === termId);
  if (sessionId) results = results.filter(r => r.session === sessionId || r.sessionId === sessionId);
  if (subjectId) results = results.filter(r => r.subject === subjectId || r.subjectId === subjectId);

  return ok(res, results, { total: results.length });
};

/* ═══════════════════════════════════════════════════════════════════════════
   GET /api/students/:id/attendance
   Query: termId, sessionId
═══════════════════════════════════════════════════════════════════════════ */
exports.getAttendance = (req, res) => {
  const student = db.findStudent(req.params.id);
  if (!student) return fail(res, 404, 'Student not found.');

  if (req.user.role === 'Parent' && req.user.wardId !== student.id) return fail(res, 403, 'Access denied.');
  if (req.user.role === 'Teacher' && !teacherCanAccess(req, res, student)) return;

  const { termId, sessionId } = req.query;
  let records = (db.attendance || []).filter(r => r.studentId === student.id);
  if (termId)    records = records.filter(r => r.term    === termId    || r.termId    === termId);
  if (sessionId) records = records.filter(r => r.session === sessionId || r.sessionId === sessionId);

  const p   = records.filter(r => (r.status || '').toLowerCase() === 'p').length;
  const a   = records.filter(r => (r.status || '').toLowerCase() === 'a').length;
  const l   = records.filter(r => (r.status || '').toLowerCase() === 'l').length;
  const e   = records.filter(r => (r.status || '').toLowerCase() === 'e').length;
  const pct = records.length ? parseFloat((p / records.length * 100).toFixed(1)) : null;

  return ok(res, records, {
    total: records.length,
    summary: { present: p, absent: a, late: l, excused: e, attendancePct: pct },
  });
};

/* ═══════════════════════════════════════════════════════════════════════════
   GET /api/students/:id/report-card
   Query: termId*
   Assembles the full data payload used by renderSingleReportCard() /
   _renderParentReportCard() in script3.js.
═══════════════════════════════════════════════════════════════════════════ */
exports.getReportCard = (req, res) => {
  const student = db.findStudent(req.params.id);
  if (!student) return fail(res, 404, 'Student not found.');

  if (req.user.role === 'Parent' && req.user.wardId !== student.id) return fail(res, 403, 'Access denied.');
  if (req.user.role === 'Teacher' && !teacherCanAccess(req, res, student)) return;

  const { termId } = req.query;
  if (!termId) return fail(res, 400, 'termId is required.');

  // Determine session from the term record (if available)
  const term    = db.terms ? db.terms.find(t => t.id === termId || t.name === termId) : null;
  const session = term?.session || (db.schoolInfo && db.schoolInfo.current_session) || '';

  const results = (db.results || []).filter(r =>
    r.studentId === student.id &&
    (r.term === termId || r.term === term?.name)
  );

  const remark = (db.remarks || []).find(r =>
    r.studentId === student.id &&
    (r.term === termId || r.term === term?.name) &&
    (!session || r.session === session)
  ) || { teacherRemark: '', principalRemark: '' };

  const domain = (db.domainAssessments || []).find(d =>
    d.studentId === student.id &&
    (d.term === termId || d.term === term?.name)
  ) || {};

  // Class position
  const classmates = (db.students || []).filter(s => s.class === student.class && s.arm === student.arm && s.active !== false);
  const scored = classmates.map(s => {
    const rr = (db.results || []).filter(r => r.studentId === s.id && (r.term === termId || r.term === term?.name));
    return { id: s.id, avg: rr.length ? rr.reduce((a, r) => a + (r.total || 0), 0) / rr.length : 0 };
  }).sort((a, b) => b.avg - a.avg);
  const posIdx  = scored.findIndex(s => s.id === student.id);
  const ordinal = n => { const sfx = ['th','st','nd','rd'], v = n % 100; return n + (sfx[(v-20)%10] || sfx[v] || sfx[0]); };
  const position = posIdx < 0 ? 'N/A' : `${ordinal(posIdx + 1)} / ${classmates.length}`;

  const subjectCount = results.length;
  const totalScore   = results.reduce((s, r) => s + (r.total || 0), 0);
  const average      = subjectCount ? parseFloat((totalScore / subjectCount).toFixed(1)) : null;

  return ok(res, {
    student,
    term:   termId,
    session,
    results,
    remark,
    domain,
    position,
    summary: { subjectCount, totalScore, average },
    schoolInfo: db.schoolInfo || {},
  });
};