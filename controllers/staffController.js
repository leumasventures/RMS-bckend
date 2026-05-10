'use strict';

/**
 * staffController.js — Sacred Heart College (SAHARCO)
 *
 * Routes (wired in staffRoutes.js):
 *   GET    /api/staff                         getAll
 *   GET    /api/staff/:id                     getOne
 *   GET    /api/staff/:id/students            getStudents
 *   POST   /api/staff                         create
 *   PUT    /api/staff/:id                     update
 *   PATCH  /api/staff/:id/status              updateStatus
 *   PATCH  /api/staff/:id/assign-class        assignClass
 *   PATCH  /api/staff/:id/assign-subject      assignSubject
 *   POST   /api/staff/:id/credentials         addCredentials
 *   DELETE /api/staff/:id/credentials/:idx    removeCredential
 *   DELETE /api/staff/:id                     remove
 *   GET    /api/staff/export                  exportStaff  (CSV)
 *
 * Legacy alias:
 *   All exports also re-exported as teacherController via module.exports alias.
 *
 * Matches STAFF_POSITIONS / STAFF_CATEGORIES / STAFF_DEPARTMENTS / STAFF_STATUSES
 * constants from script2.js exactly.
 */

const db = require('../config/db');

/* ─── constants ─────────────────────────────────────────────────────────── */

const VALID_CATEGORIES  = ['Academic', 'Administrative', 'Support', 'Leadership'];
const VALID_STATUSES    = ['Active', 'On Leave', 'Suspended', 'Resigned'];
const VALID_DEPARTMENTS = [
  'Sciences', 'Humanities', 'Languages', 'Mathematics', 'Social Studies',
  'Arts', 'Technical', 'Administration', 'Support Services', 'Management',
];

// Mirrors STAFF_POSITIONS from script2.js (flattened for validation)
const ALL_POSITIONS = [
  'Class Teacher','Form Master/Mistress','Subject Teacher','HOD',
  'Dean of Studies','Vice Principal (Academic)','Principal',
  'Deputy Principal','ICT Director','Librarian','Counsellor',
  'Lab Technician','Sports Master','Patron',
  'Secretary','Bursar','Accounts Officer','Admin Officer',
  'HR Officer','PRO','Store Keeper','Receptionist','Vice Principal (Admin)',
  'Driver','Security Officer','Cleaner','Gardener',
  'Canteen Manager','Chef/Cook','Maintenance Officer','Nurse/First Aider',
  'Director','Proprietor/Proprietress',
];

/* ─── helpers ────────────────────────────────────────────────────────────── */

const fail = (res, status, msg, extra = {}) =>
  res.status(status).json({ success: false, message: msg, ...extra });

const ok = (res, data, meta = {}, status = 200) =>
  res.status(status).json({ success: true, ...meta, data });

function makeStaffId(list) {
  const num = (list || []).length + 1;
  return 'S' + String(num).padStart(3, '0');
}

function findStaff(id) {
  return (db.staff || []).find(s => s.id === id);
}

function findStaffByEmail(email) {
  return (db.staff || []).find(s =>
    s.email && s.email.toLowerCase() === email.toLowerCase().trim()
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   GET /api/staff
   Query: category, status, department, subject, classUnit, search, page, limit
═══════════════════════════════════════════════════════════════════════════ */
exports.getAll = (req, res) => {
  const { category, status, department, subject, classUnit, search,
          page = '1', limit = '100' } = req.query;

  let list = [...(db.staff || [])];

  if (category)   list = list.filter(s => s.category   === category);
  if (status)     list = list.filter(s => s.status     === status);
  if (department) list = list.filter(s => s.department === department);
  if (subject)    list = list.filter(s => s.subject    === subject);
  if (classUnit)  list = list.filter(s => (s.classUnit || s.class) === classUnit);

  if (search) {
    const q = search.toLowerCase();
    list = list.filter(s =>
      [s.name, s.position, s.subject, s.id, s.department, s.classUnit, s.class]
        .some(f => (f || '').toLowerCase().includes(q))
    );
  }

  const total    = list.length;
  const pageNum  = Math.max(1, parseInt(page,  10) || 1);
  const limitNum = Math.min(500, Math.max(1, parseInt(limit, 10) || 100));

  return res.json({
    success: true,
    data:       list.slice((pageNum - 1) * limitNum, pageNum * limitNum),
    total,
    page:       pageNum,
    limit:      limitNum,
    totalPages: Math.ceil(total / limitNum),
  });
};

/* ═══════════════════════════════════════════════════════════════════════════
   GET /api/staff/:id
═══════════════════════════════════════════════════════════════════════════ */
exports.getOne = (req, res) => {
  const member = findStaff(req.params.id);
  if (!member) return fail(res, 404, `Staff member "${req.params.id}" not found.`);
  return ok(res, member);
};

/* ═══════════════════════════════════════════════════════════════════════════
   GET /api/staff/:id/students
   Returns students in the staff member's assigned class/arm.
═══════════════════════════════════════════════════════════════════════════ */
exports.getStudents = (req, res) => {
  const member = findStaff(req.params.id);
  if (!member) return fail(res, 404, `Staff member "${req.params.id}" not found.`);

  if (member.category !== 'Academic')
    return fail(res, 400, 'Only Academic staff have assigned students.');

  const cls = member.classUnit || member.class;
  if (!cls) return ok(res, [], { total: 0, message: 'No class assigned.' });

  const data = (db.students || []).filter(s =>
    s.class === cls &&
    (!member.arm || s.arm === member.arm) &&
    s.active !== false
  );
  return ok(res, data, { total: data.length });
};

/* ═══════════════════════════════════════════════════════════════════════════
   POST /api/staff
   Body: {
     name*, email, gender, phone, dateJoined, status,
     category*, position*, department, subject, classUnit, arm,
     qualification, experience, notes,
     credentials: [{ name, size, type }]
   }
   Mirrors openStaffModal's smSubmitForm() in script2.js.
═══════════════════════════════════════════════════════════════════════════ */
exports.create = (req, res) => {
  const {
    name, email, gender, phone, dateJoined,
    category, position, department, subject, classUnit, arm,
    qualification, experience, notes, credentials,
  } = req.body;

  const missing = ['name', 'category', 'position'].filter(f => !req.body[f]);
  if (missing.length) return fail(res, 400, `Missing required fields: ${missing.join(', ')}.`);

  if (!VALID_CATEGORIES.includes(category))
    return fail(res, 400, `category must be one of: ${VALID_CATEGORIES.join(', ')}.`);

  if (department && !VALID_DEPARTMENTS.includes(department))
    return fail(res, 400, `Invalid department "${department}".`);

  // Email uniqueness
  if (email && findStaffByEmail(email))
    return fail(res, 409, `Email "${email}" is already in use.`);

  // Class exists check
  if (classUnit && !db.findClass(classUnit))
    return fail(res, 400, `Class "${classUnit}" does not exist.`);

  // Arm check
  if (classUnit && arm) {
    const cls = db.findClass(classUnit);
    if (cls && cls.arms && !cls.arms.includes(arm))
      return fail(res, 400, `Arm "${arm}" does not exist in "${classUnit}". Valid arms: ${cls.arms.join(', ')}.`);
  }

  if (!db.staff) db.staff = [];

  const member = {
    id:            makeStaffId(db.staff),
    role:          'Staff',
    name:          String(name).trim(),
    email:         email ? String(email).toLowerCase().trim() : '',
    gender:        gender        || '',
    phone:         phone         || '',
    dateJoined:    dateJoined    || new Date().toISOString().slice(0, 10),
    status:        VALID_STATUSES.includes(req.body.status) ? req.body.status : 'Active',
    category,
    position:      String(position).trim(),
    department:    department    || '',
    subject:       subject       || '',
    classUnit:     classUnit     || '',
    // Keep both field names for compatibility with script2.js smRenderTable
    class:         classUnit     || '',
    arm:           arm           || '',
    assignedClass: classUnit     || '',
    assignedArm:   arm           || '',
    qualification: qualification || '',
    experience:    experience    || '',
    notes:         notes         || '',
    credentials:   Array.isArray(credentials) ? credentials : [],
  };

  db.staff.push(member);

  // Keep legacy db.teachers in sync (script2.js uses both)
  if (!db.teachers) db.teachers = [];
  if (['Academic', 'Leadership'].includes(category)) db.teachers.push(member);

  return ok(res, member, {}, 201);
};

/* ═══════════════════════════════════════════════════════════════════════════
   PUT /api/staff/:id
═══════════════════════════════════════════════════════════════════════════ */
exports.update = (req, res) => {
  const idx = (db.staff || []).findIndex(s => s.id === req.params.id);
  if (idx < 0) return fail(res, 404, 'Staff member not found.');

  const { category, department, classUnit, arm, email, status } = req.body;

  if (category && !VALID_CATEGORIES.includes(category))
    return fail(res, 400, `category must be one of: ${VALID_CATEGORIES.join(', ')}.`);

  if (department && !VALID_DEPARTMENTS.includes(department))
    return fail(res, 400, `Invalid department "${department}".`);

  if (status && !VALID_STATUSES.includes(status))
    return fail(res, 400, `status must be one of: ${VALID_STATUSES.join(', ')}.`);

  if (classUnit && !db.findClass(classUnit))
    return fail(res, 400, `Class "${classUnit}" does not exist.`);

  if (classUnit && arm) {
    const cls = db.findClass(classUnit);
    if (cls && cls.arms && !cls.arms.includes(arm))
      return fail(res, 400, `Arm "${arm}" does not exist in "${classUnit}". Valid arms: ${cls.arms.join(', ')}.`);
  }

  if (email) {
    const clash = findStaffByEmail(email);
    if (clash && clash.id !== req.params.id)
      return fail(res, 409, `Email "${email}" is already in use.`);
  }

  const { id: _id, ...updates } = req.body;
  if (updates.email) updates.email = updates.email.toLowerCase().trim();

  // Keep dual field names in sync
  if (updates.classUnit) { updates.class = updates.classUnit; updates.assignedClass = updates.classUnit; }
  if (updates.arm)       { updates.assignedArm = updates.arm; }

  db.staff[idx] = { ...db.staff[idx], ...updates, id: req.params.id };

  // Sync teachers array
  if (!db.teachers) db.teachers = [];
  const tIdx = db.teachers.findIndex(t => t.id === req.params.id);
  if (tIdx >= 0) db.teachers[tIdx] = db.staff[idx];

  return ok(res, db.staff[idx]);
};

/* ═══════════════════════════════════════════════════════════════════════════
   PATCH /api/staff/:id/status
   Body: { status }
═══════════════════════════════════════════════════════════════════════════ */
exports.updateStatus = (req, res) => {
  const { status } = req.body;
  if (!status || !VALID_STATUSES.includes(status))
    return fail(res, 400, `status must be one of: ${VALID_STATUSES.join(', ')}.`);

  const idx = (db.staff || []).findIndex(s => s.id === req.params.id);
  if (idx < 0) return fail(res, 404, 'Staff member not found.');

  db.staff[idx].status = status;

  const tIdx = (db.teachers || []).findIndex(t => t.id === req.params.id);
  if (tIdx >= 0) db.teachers[tIdx].status = status;

  return ok(res, db.staff[idx]);
};

/* ═══════════════════════════════════════════════════════════════════════════
   PATCH /api/staff/:id/assign-class
   Body: { classUnit, arm }
   Mirrors Teachers.assignClass() in api.js.
═══════════════════════════════════════════════════════════════════════════ */
exports.assignClass = (req, res) => {
  const { classUnit, arm } = req.body;
  if (classUnit && !db.findClass(classUnit))
    return fail(res, 400, `Class "${classUnit}" does not exist.`);

  if (classUnit && arm) {
    const cls = db.findClass(classUnit);
    if (cls && cls.arms && !cls.arms.includes(arm))
      return fail(res, 400, `Arm "${arm}" does not exist in "${classUnit}". Valid arms: ${cls.arms.join(', ')}.`);
  }

  const idx = (db.staff || []).findIndex(s => s.id === req.params.id);
  if (idx < 0) return fail(res, 404, 'Staff member not found.');

  if (db.staff[idx].category !== 'Academic')
    return fail(res, 400, 'Class assignment is only applicable to Academic staff.');

  const cu = classUnit ?? db.staff[idx].classUnit;
  const a  = arm       ?? db.staff[idx].arm;

  db.staff[idx] = {
    ...db.staff[idx],
    classUnit: cu, class: cu, assignedClass: cu,
    arm: a, assignedArm: a,
  };

  const tIdx = (db.teachers || []).findIndex(t => t.id === req.params.id);
  if (tIdx >= 0) db.teachers[tIdx] = db.staff[idx];

  return ok(res, db.staff[idx]);
};

/* ═══════════════════════════════════════════════════════════════════════════
   PATCH /api/staff/:id/assign-subject
   Body: { subject_id, class_id }
   Mirrors Teachers.assignSubject() in api.js.
═══════════════════════════════════════════════════════════════════════════ */
exports.assignSubject = (req, res) => {
  const { subject_id, class_id } = req.body;

  const idx = (db.staff || []).findIndex(s => s.id === req.params.id);
  if (idx < 0) return fail(res, 404, 'Staff member not found.');

  // subject_id may be a name or numeric id
  let subjectName = subject_id;
  if (db.subjects) {
    const subj = db.subjects.find(s => s.id === Number(subject_id) || s.name === subject_id);
    if (subj) subjectName = subj.name;
  }

  db.staff[idx].subject = subjectName;
  if (class_id) {
    db.staff[idx].classUnit     = class_id;
    db.staff[idx].class         = class_id;
    db.staff[idx].assignedClass = class_id;
  }

  const tIdx = (db.teachers || []).findIndex(t => t.id === req.params.id);
  if (tIdx >= 0) db.teachers[tIdx] = db.staff[idx];

  return ok(res, db.staff[idx]);
};

/* ═══════════════════════════════════════════════════════════════════════════
   POST /api/staff/:id/credentials
   Body: { credentials: [{ name, size, type }] }
   Appends credential metadata (actual file stored by Multer middleware).
   Mirrors apiUploadStaffCredential() in api-bridge.js.
═══════════════════════════════════════════════════════════════════════════ */
exports.addCredentials = (req, res) => {
  const member = findStaff(req.params.id);
  if (!member) return fail(res, 404, 'Staff member not found.');

  // Accept either { credentials: [...] } body or a single req.file from Multer
  let incoming = [];
  if (Array.isArray(req.body.credentials)) {
    incoming = req.body.credentials;
  } else if (req.file) {
    incoming = [{
      name: req.file.originalname || req.file.filename,
      size: req.file.size ? `${(req.file.size / 1024).toFixed(1)} KB` : '',
      type: req.body.type || 'Document',
      path: req.file.path || req.file.filename,
    }];
  }

  if (!incoming.length) return fail(res, 400, 'No credentials provided.');

  member.credentials = [...(member.credentials || []), ...incoming];

  // Return the last added credential so api-bridge can push it to the cache
  return ok(res, {
    credentials: member.credentials,
    credential:  incoming[incoming.length - 1],
  });
};

/* ═══════════════════════════════════════════════════════════════════════════
   DELETE /api/staff/:id/credentials/:credIndex
   Removes a credential by array index.
═══════════════════════════════════════════════════════════════════════════ */
exports.removeCredential = (req, res) => {
  const member = findStaff(req.params.id);
  if (!member) return fail(res, 404, 'Staff member not found.');

  const idx = parseInt(req.params.credIndex, 10);
  if (isNaN(idx) || idx < 0 || idx >= (member.credentials || []).length)
    return fail(res, 400, 'Invalid credential index.');

  const [removed] = member.credentials.splice(idx, 1);
  return ok(res, member.credentials, { message: `Credential "${removed.name}" removed.` });
};

/* ═══════════════════════════════════════════════════════════════════════════
   DELETE /api/staff/:id
═══════════════════════════════════════════════════════════════════════════ */
exports.remove = (req, res) => {
  const idx = (db.staff || []).findIndex(s => s.id === req.params.id);
  if (idx < 0) return fail(res, 404, 'Staff member not found.');

  const [removed] = db.staff.splice(idx, 1);

  // Remove from teachers array too
  if (db.teachers) {
    const tIdx = db.teachers.findIndex(t => t.id === req.params.id);
    if (tIdx >= 0) db.teachers.splice(tIdx, 1);
  }

  return ok(res, removed, { message: `Staff member "${removed.name}" removed.` });
};

/* ═══════════════════════════════════════════════════════════════════════════
   GET /api/staff/export
   Query: category, status, format (csv)
   Matches smExport() in script2.js column order.
═══════════════════════════════════════════════════════════════════════════ */
exports.exportStaff = (req, res) => {
  const { category, status } = req.query;
  let list = [...(db.staff || [])];
  if (category) list = list.filter(s => s.category === category);
  if (status)   list = list.filter(s => s.status   === status);

  const headers = ['ID', 'Name', 'Category', 'Position', 'Department',
                   'Class/Unit', 'Subject', 'Phone', 'Email', 'Status',
                   'Qualification', 'Experience', 'Date Joined'];

  const rows = list.map(s => [
    s.id, s.name, s.category, s.position, s.department,
    s.classUnit || s.class || '', s.subject, s.phone, s.email,
    s.status, s.qualification, s.experience, s.dateJoined,
  ]);

  const csv = [headers, ...rows]
    .map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\r\n');

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="staff_list.csv"');
  return res.send('\uFEFF' + csv);
};

/* ─── legacy alias ───────────────────────────────────────────────────────── */
// Keeps any existing import { renderTeachers } / teacherController refs working.
module.exports = { ...module.exports };