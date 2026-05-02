'use strict';

const db = require('../config/db');

/* ── Allowed values (mirrors frontend constants) ────────────────────────────── */
const VALID_CATEGORIES = ['Academic', 'Administrative', 'Support', 'Leadership'];
const VALID_STATUSES   = ['Active', 'On Leave', 'Suspended', 'Resigned'];
const VALID_DEPARTMENTS = [
  'Sciences', 'Humanities', 'Languages', 'Mathematics', 'Social Studies',
  'Arts', 'Technical', 'Administration', 'Support Services', 'Management',
];

/* ── Helpers ────────────────────────────────────────────────────────────────── */
function makeStaffId(list) {
  const num = (list || []).length + 1;
  return 'S' + String(num).padStart(3, '0');
}

function findStaff(id) {
  return (db.staff || []).find(s => s.id === id);
}

function findStaffByEmail(email) {
  return (db.staff || []).find(s => s.email === email?.toLowerCase().trim());
}

/* ═══════════════════════════════════════════════════════════════════════════════
   GET /api/staff
   Query: category, status, department, subject, classUnit, search
═══════════════════════════════════════════════════════════════════════════════ */
exports.getAll = (req, res) => {
  const { category, status, department, subject, classUnit, search } = req.query;

  let list = [...(db.staff || [])];

  if (category)   list = list.filter(s => s.category   === category);
  if (status)     list = list.filter(s => s.status     === status);
  if (department) list = list.filter(s => s.department === department);
  if (subject)    list = list.filter(s => s.subject    === subject);
  if (classUnit)  list = list.filter(s => s.classUnit  === classUnit);

  if (search) {
    const q = search.toLowerCase();
    list = list.filter(s =>
      [s.name, s.position, s.subject, s.id, s.department]
        .some(f => (f || '').toLowerCase().includes(q))
    );
  }

  return res.json({ success: true, data: list, total: list.length });
};

/* ═══════════════════════════════════════════════════════════════════════════════
   GET /api/staff/:id
═══════════════════════════════════════════════════════════════════════════════ */
exports.getOne = (req, res) => {
  const member = findStaff(req.params.id);
  if (!member)
    return res.status(404).json({ success: false, message: `Staff member "${req.params.id}" not found.` });

  return res.json({ success: true, data: member });
};

/* ═══════════════════════════════════════════════════════════════════════════════
   GET /api/staff/:id/students
   Returns students in the staff member's assigned class/arm (academic staff)
═══════════════════════════════════════════════════════════════════════════════ */
exports.getStudents = (req, res) => {
  const member = findStaff(req.params.id);
  if (!member)
    return res.status(404).json({ success: false, message: `Staff member "${req.params.id}" not found.` });

  if (member.category !== 'Academic')
    return res.status(400).json({ success: false, message: 'Only academic staff have assigned students.' });

  if (!member.classUnit)
    return res.json({ success: true, data: [], total: 0, message: 'Staff member has no assigned class.' });

  const data = db.studentsInClass(member.classUnit, member.arm);
  return res.json({ success: true, data, total: data.length });
};

/* ═══════════════════════════════════════════════════════════════════════════════
   POST /api/staff   —  Admin only
   Body: {
     name*, email*, gender, phone, dateJoined, status,
     category*, position*, department, subject, classUnit, arm,
     qualification, experience, notes,
     credentials: [{ name, size, type }]
   }
═══════════════════════════════════════════════════════════════════════════════ */
exports.create = (req, res) => {
  const {
    name, email, gender, phone, dateJoined,
    category, position, department, subject, classUnit, arm,
    qualification, experience, notes,
    credentials,
  } = req.body;

  // Required fields
  const missing = ['name', 'category', 'position'].filter(f => !req.body[f]);
  if (missing.length)
    return res.status(400).json({ success: false, message: `Missing required fields: ${missing.join(', ')}.` });

  // Validate enums
  if (!VALID_CATEGORIES.includes(category))
    return res.status(400).json({ success: false, message: `Category must be one of: ${VALID_CATEGORIES.join(', ')}.` });

  if (department && !VALID_DEPARTMENTS.includes(department))
    return res.status(400).json({ success: false, message: `Invalid department "${department}".` });

  // Duplicate e-mail check
  if (email && findStaffByEmail(email))
    return res.status(409).json({ success: false, message: `Email "${email}" is already in use.` });

  // Class exists check (if provided)
  if (classUnit && !db.findClass(classUnit))
    return res.status(400).json({ success: false, message: `Class "${classUnit}" does not exist.` });

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
    category:      category,
    position:      String(position).trim(),
    department:    department    || '',
    subject:       subject       || '',
    classUnit:     classUnit     || '',
    arm:           arm           || '',
    qualification: qualification || '',
    experience:    experience    || '',
    notes:         notes         || '',
    credentials:   Array.isArray(credentials) ? credentials : [],
  };

  db.staff.push(member);
  return res.status(201).json({ success: true, data: member });
};

/* ═══════════════════════════════════════════════════════════════════════════════
   PUT /api/staff/:id   —  Admin only
   Full update (all editable fields); id is immutable.
═══════════════════════════════════════════════════════════════════════════════ */
exports.update = (req, res) => {
  const idx = (db.staff || []).findIndex(s => s.id === req.params.id);
  if (idx < 0)
    return res.status(404).json({ success: false, message: 'Staff member not found.' });

  const { category, department, classUnit, email } = req.body;

  if (category && !VALID_CATEGORIES.includes(category))
    return res.status(400).json({ success: false, message: `Category must be one of: ${VALID_CATEGORIES.join(', ')}.` });

  if (department && !VALID_DEPARTMENTS.includes(department))
    return res.status(400).json({ success: false, message: `Invalid department "${department}".` });

  if (classUnit && !db.findClass(classUnit))
    return res.status(400).json({ success: false, message: `Class "${classUnit}" does not exist.` });

  if (email) {
    const clash = findStaffByEmail(email);
    if (clash && clash.id !== req.params.id)
      return res.status(409).json({ success: false, message: `Email "${email}" is already in use.` });
  }

  // Strip id from body to prevent overwrite
  const { id: _id, ...updates } = req.body;
  if (updates.email) updates.email = updates.email.toLowerCase().trim();

  db.staff[idx] = { ...db.staff[idx], ...updates, id: req.params.id };
  return res.json({ success: true, data: db.staff[idx] });
};

/* ═══════════════════════════════════════════════════════════════════════════════
   PATCH /api/staff/:id/status   —  Admin only
   Body: { status: 'Active' | 'On Leave' | 'Suspended' | 'Resigned' }
═══════════════════════════════════════════════════════════════════════════════ */
exports.updateStatus = (req, res) => {
  const { status } = req.body;

  if (!status || !VALID_STATUSES.includes(status))
    return res.status(400).json({ success: false, message: `Status must be one of: ${VALID_STATUSES.join(', ')}.` });

  const idx = (db.staff || []).findIndex(s => s.id === req.params.id);
  if (idx < 0)
    return res.status(404).json({ success: false, message: 'Staff member not found.' });

  db.staff[idx].status = status;
  return res.json({ success: true, data: db.staff[idx] });
};

/* ═══════════════════════════════════════════════════════════════════════════════
   PATCH /api/staff/:id/assign-class   —  Admin only
   Body: { classUnit, arm }
   Only relevant for academic staff.
═══════════════════════════════════════════════════════════════════════════════ */
exports.assignClass = (req, res) => {
  const { classUnit, arm } = req.body;

  if (classUnit && !db.findClass(classUnit))
    return res.status(400).json({ success: false, message: `Class "${classUnit}" does not exist.` });

  const idx = (db.staff || []).findIndex(s => s.id === req.params.id);
  if (idx < 0)
    return res.status(404).json({ success: false, message: 'Staff member not found.' });

  if (db.staff[idx].category !== 'Academic')
    return res.status(400).json({ success: false, message: 'Class assignment is only applicable to Academic staff.' });

  db.staff[idx] = {
    ...db.staff[idx],
    classUnit: classUnit ?? db.staff[idx].classUnit,
    arm:       arm       ?? db.staff[idx].arm,
  };

  return res.json({ success: true, data: db.staff[idx] });
};

/* ═══════════════════════════════════════════════════════════════════════════════
   POST /api/staff/:id/credentials   —  Admin only
   Body: { credentials: [{ name, size, type }] }
   Appends new credential metadata to the staff member's credentials array.
   (Actual file storage is handled separately by a file-upload middleware.)
═══════════════════════════════════════════════════════════════════════════════ */
exports.addCredentials = (req, res) => {
  const member = findStaff(req.params.id);
  if (!member)
    return res.status(404).json({ success: false, message: 'Staff member not found.' });

  const incoming = Array.isArray(req.body.credentials) ? req.body.credentials : [];
  if (!incoming.length)
    return res.status(400).json({ success: false, message: 'No credentials provided.' });

  member.credentials = [...(member.credentials || []), ...incoming];
  return res.json({ success: true, data: member.credentials });
};

/* ═══════════════════════════════════════════════════════════════════════════════
   DELETE /api/staff/:id/credentials/:credIndex   —  Admin only
   Removes a single credential by its array index.
═══════════════════════════════════════════════════════════════════════════════ */
exports.removeCredential = (req, res) => {
  const member = findStaff(req.params.id);
  if (!member)
    return res.status(404).json({ success: false, message: 'Staff member not found.' });

  const idx = parseInt(req.params.credIndex, 10);
  if (isNaN(idx) || idx < 0 || idx >= (member.credentials || []).length)
    return res.status(400).json({ success: false, message: 'Invalid credential index.' });

  const [removed] = member.credentials.splice(idx, 1);
  return res.json({ success: true, message: `Credential "${removed.name}" removed.`, data: member.credentials });
};

/* ═══════════════════════════════════════════════════════════════════════════════
   DELETE /api/staff/:id   —  Admin only
═══════════════════════════════════════════════════════════════════════════════ */
exports.remove = (req, res) => {
  const idx = (db.staff || []).findIndex(s => s.id === req.params.id);
  if (idx < 0)
    return res.status(404).json({ success: false, message: 'Staff member not found.' });

  const [removed] = db.staff.splice(idx, 1);
  return res.json({ success: true, message: `Staff member "${removed.name}" removed.`, data: removed });
};

/* ── Legacy alias — keeps any existing teacherController imports working ─────── */
module.exports = { ...module.exports };