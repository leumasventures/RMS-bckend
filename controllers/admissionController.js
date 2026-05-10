'use strict';

/**
 * admissionController.js — Sacred Heart College (SAHARCO)
 *
 * Routes (wired in admissionRoutes.js):
 *   GET    /api/admissions              getAll
 *   GET    /api/admissions/stats        getStats
 *   GET    /api/admissions/:id          getOne
 *   POST   /api/admissions              create
 *   PUT    /api/admissions/:id          update
 *   PATCH  /api/admissions/:id/approve  approve
 *   PATCH  /api/admissions/:id/reject   reject
 *   POST   /api/admissions/:id/enroll   enroll
 *   POST   /api/admissions/bulk-enroll  bulkEnroll
 *   DELETE /api/admissions/:id          remove
 *   GET    /api/admissions/export       exportAdmissions  (CSV/xlsx)
 *   POST   /api/admissions/:id/photo    uploadPhoto       (stub)
 *
 * Field names match regForm.html and api.js Admissions module exactly.
 */

const db = require('../config/db');

/* ─── constants ─────────────────────────────────────────────────────────── */
const VALID_STATUSES = ['Pending', 'Approved', 'Rejected', 'Enrolled', 'Draft'];

/* ─── tiny helpers ───────────────────────────────────────────────────────── */
const fail = (res, status, msg, extra = {}) =>
  res.status(status).json({ success: false, message: msg, ...extra });

const ok = (res, data, meta = {}, status = 200) =>
  res.status(status).json({ success: true, ...meta, data });

/** ADM/YYYY/NNN — uses the session's end year */
function generateAppNo(session) {
  const year  = (session || '2025/2026').split('/')[1] || String(new Date().getFullYear());
  const count = (db.admissions || []).length + 1;
  return `ADM/${year}/${String(count).padStart(3, '0')}`;
}

/** Collision-free SHC/NNN */
function generateStudentId() {
  const existing = new Set((db.students || []).map(s => s.id));
  let n = (db.students || []).length + 1, id;
  do { id = `SHC/${String(n).padStart(3, '0')}`; n++; } while (existing.has(id));
  return id;
}

/* ═══════════════════════════════════════════════════════════════════════════
   GET /api/admissions
   Query: status, session, applyingForClass, search, page, limit
═══════════════════════════════════════════════════════════════════════════ */
exports.getAll = (req, res) => {
  const { status, session, applyingForClass, search,
          page = '1', limit = '50' } = req.query;

  let list = [...(db.admissions || [])];
  if (status)           list = list.filter(a => a.status           === status);
  if (session)          list = list.filter(a => a.session          === session);
  if (applyingForClass) list = list.filter(a => a.applyingForClass === applyingForClass);

  if (search) {
    const q = search.toLowerCase();
    list = list.filter(a =>
      [a.applicantName, a.applicationNo, a.parentName,
       a.parentPhone,   a.parentEmail,   a.applyingForClass]
        .some(f => (f || '').toLowerCase().includes(q))
    );
  }

  const total    = list.length;
  const pageNum  = Math.max(1, parseInt(page,  10) || 1);
  const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));

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
   GET /api/admissions/stats
   Returns { total, pending, approved, enrolled, rejected, draft }
   Used by dashboard cards and Reports.admissions() in api.js.
═══════════════════════════════════════════════════════════════════════════ */
exports.getStats = (req, res) => {
  const { session } = req.query;
  let list = db.admissions || [];
  if (session) list = list.filter(a => a.session === session);

  const counts = { total: list.length, pending: 0, approved: 0, enrolled: 0, rejected: 0, draft: 0 };
  list.forEach(a => {
    const key = (a.status || '').toLowerCase();
    if (counts[key] !== undefined) counts[key]++;
  });
  return res.json({ success: true, data: counts });
};

/* ═══════════════════════════════════════════════════════════════════════════
   GET /api/admissions/:id
═══════════════════════════════════════════════════════════════════════════ */
exports.getOne = (req, res) => {
  const admission = (db.admissions || []).find(a => a.id === Number(req.params.id));
  if (!admission) return fail(res, 404, `Admission ${req.params.id} not found.`);
  return ok(res, admission);
};

/* ═══════════════════════════════════════════════════════════════════════════
   POST /api/admissions
   Body fields match regForm.html (see api.js Admissions.create docs).
═══════════════════════════════════════════════════════════════════════════ */
exports.create = (req, res) => {
  const {
    first_name, last_name, middle_name,
    gender, dob, blood_group, genotype, allergies, med_conditions,
    state_origin, lga, address,
    class_apply, preferred_arm, acad_session, entry_term,
    prev_school, last_class,
    guardian_last, guardian_first, relation,
    guardian_phone, guardian_email, guardian_addr,
    notes,
  } = req.body;

  const required = { first_name, last_name, gender, dob, class_apply, acad_session, guardian_last, guardian_phone };
  const missing  = Object.entries(required).filter(([, v]) => !v).map(([k]) => k);
  if (missing.length) return fail(res, 400, `Missing required fields: ${missing.join(', ')}.`);

  if (!db.findClass(class_apply))
    return fail(res, 400, `Class "${class_apply}" does not exist.`);

  if (!db.admissions) db.admissions = [];

  const applicantName = [first_name, middle_name, last_name].filter(Boolean).map(s => s.trim()).join(' ');
  const parentName    = [guardian_first, guardian_last].filter(Boolean).map(s => s.trim()).join(' ');

  const admission = {
    id:                db.nextId ? db.nextId() : Date.now(),
    applicationNo:     generateAppNo(acad_session),
    /* Applicant */
    applicantName,
    first_name:        String(first_name).trim(),
    last_name:         String(last_name).trim(),
    middle_name:       middle_name    || '',
    gender,
    dob,
    blood_group:       blood_group    || '',
    genotype:          genotype       || '',
    allergies:         allergies      || '',
    med_conditions:    med_conditions || '',
    state_origin:      state_origin   || '',
    lga:               lga            || '',
    address:           address        || '',
    /* Placement */
    applyingForClass:  class_apply,
    preferred_arm:     preferred_arm  || '',
    session:           acad_session,
    entry_term:        entry_term     || '',
    prev_school:       prev_school    || '',
    last_class:        last_class     || '',
    /* Guardian */
    parentName,
    guardian_first:    guardian_first || '',
    guardian_last:     String(guardian_last).trim(),
    relation:          relation       || '',
    parentPhone:       String(guardian_phone).trim(),
    parentEmail:       guardian_email || '',
    guardian_addr:     guardian_addr  || '',
    /* System */
    status:            'Pending',
    appliedAt:         new Date().toISOString().slice(0, 10),
    admittedAt:        null,
    assignedStudentId: null,
    assignedClass:     null,
    assignedArm:       null,
    notes:             notes || '',
  };

  db.admissions.push(admission);
  return ok(res, admission, {}, 201);
};

/* ═══════════════════════════════════════════════════════════════════════════
   PUT /api/admissions/:id
═══════════════════════════════════════════════════════════════════════════ */
exports.update = (req, res) => {
  const idx = (db.admissions || []).findIndex(a => a.id === Number(req.params.id));
  if (idx < 0) return fail(res, 404, 'Admission record not found.');

  if (db.admissions[idx].status === 'Enrolled')
    return fail(res, 400, 'Cannot edit an enrolled admission. Update the student record instead.');

  if (req.body.status && !VALID_STATUSES.includes(req.body.status))
    return fail(res, 400, `Status must be one of: ${VALID_STATUSES.join(', ')}.`);

  const newClass = req.body.class_apply || req.body.applyingForClass;
  if (newClass && !db.findClass(newClass))
    return fail(res, 400, `Class "${newClass}" does not exist.`);

  const { id: _id, applicationNo: _appNo, assignedStudentId: _sid, ...updates } = req.body;

  // Normalise field aliases
  if (updates.class_apply)   { updates.applyingForClass = updates.class_apply;   delete updates.class_apply;   }
  if (updates.acad_session)  { updates.session          = updates.acad_session;  delete updates.acad_session;  }
  if (updates.guardian_phone){ updates.parentPhone      = updates.guardian_phone; delete updates.guardian_phone; }
  if (updates.guardian_email){ updates.parentEmail      = updates.guardian_email; delete updates.guardian_email; }

  db.admissions[idx] = { ...db.admissions[idx], ...updates };
  return ok(res, db.admissions[idx]);
};

/* ═══════════════════════════════════════════════════════════════════════════
   PATCH /api/admissions/:id/approve
   Body: { assignedClass, assignedArm, notes? }
═══════════════════════════════════════════════════════════════════════════ */
exports.approve = (req, res) => {
  const idx = (db.admissions || []).findIndex(a => a.id === Number(req.params.id));
  if (idx < 0) return fail(res, 404, 'Admission record not found.');

  const admission = db.admissions[idx];
  if (admission.status === 'Enrolled') return fail(res, 400, 'Application is already enrolled.');
  if (admission.status === 'Rejected') return fail(res, 400, 'A rejected application cannot be approved directly. Update status first.');

  const { assignedClass, assignedArm, notes } = req.body;
  if (!assignedClass || !assignedArm) return fail(res, 400, 'assignedClass and assignedArm are required.');

  const cls = db.findClass(assignedClass);
  if (!cls) return fail(res, 400, `Class "${assignedClass}" does not exist.`);
  if (cls.arms && !cls.arms.includes(assignedArm))
    return fail(res, 400, `Arm "${assignedArm}" does not exist in "${assignedClass}". Valid arms: ${cls.arms.join(', ')}.`);

  db.admissions[idx] = {
    ...admission,
    status: 'Approved',
    assignedClass,
    assignedArm,
    admittedAt: new Date().toISOString().slice(0, 10),
    notes: notes !== undefined ? notes : admission.notes,
  };
  return ok(res, db.admissions[idx]);
};

/* ═══════════════════════════════════════════════════════════════════════════
   PATCH /api/admissions/:id/reject
   Body: { notes? }
═══════════════════════════════════════════════════════════════════════════ */
exports.reject = (req, res) => {
  const idx = (db.admissions || []).findIndex(a => a.id === Number(req.params.id));
  if (idx < 0) return fail(res, 404, 'Admission record not found.');
  if (db.admissions[idx].status === 'Enrolled') return fail(res, 400, 'An enrolled student cannot be rejected.');

  db.admissions[idx].status = 'Rejected';
  if (req.body.notes !== undefined) db.admissions[idx].notes = req.body.notes;
  return ok(res, db.admissions[idx]);
};

/* ═══════════════════════════════════════════════════════════════════════════
   POST /api/admissions/:id/enroll
   Body: { class_id?, arm?, session_id?, studentId? }
   Matches api.js Admissions.enroll() signature.
═══════════════════════════════════════════════════════════════════════════ */
exports.enroll = (req, res) => {
  const idx = (db.admissions || []).findIndex(a => a.id === Number(req.params.id));
  if (idx < 0) return fail(res, 404, 'Admission record not found.');

  const admission = db.admissions[idx];
  if (admission.status !== 'Approved') return fail(res, 400, 'Only Approved applications can be enrolled.');

  // Allow override of class/arm from enroll.html
  const cls = req.body.class_id || req.body.assignedClass || admission.assignedClass;
  const arm = req.body.arm      || admission.assignedArm;
  if (!cls || !arm) return fail(res, 400, 'Class and arm are required for enrollment.');

  const clsObj = db.findClass(cls);
  if (!clsObj) return fail(res, 400, `Class "${cls}" does not exist.`);
  if (clsObj.arms && !clsObj.arms.includes(arm))
    return fail(res, 400, `Arm "${arm}" does not exist in "${cls}". Valid arms: ${clsObj.arms.join(', ')}.`);

  const studentId = req.body.studentId || generateStudentId();
  if ((db.students || []).find(s => s.id === studentId))
    return fail(res, 409, `Student ID "${studentId}" already exists. Provide a different one.`);

  const student = {
    id:         studentId,
    name:       admission.applicantName,
    class:      cls,
    arm,
    gender:     admission.gender,
    dob:        admission.dob,
    parent:     admission.parentName,
    phone:      admission.parentPhone,
    address:    admission.address  || '',
    attendance: 100,
    active:     true,
  };

  if (!db.students) db.students = [];
  db.students.push(student);

  db.admissions[idx] = {
    ...admission,
    status:            'Enrolled',
    assignedClass:     cls,
    assignedArm:       arm,
    assignedStudentId: studentId,
  };

  return res.status(201).json({
    success: true,
    message: `"${student.name}" enrolled as ${studentId}.`,
    data: { student, admission: db.admissions[idx] },
  });
};

/* ═══════════════════════════════════════════════════════════════════════════
   POST /api/admissions/bulk-enroll
   Body: { enrollments: [{ admission_id, class_id, arm }] }
   Returns: { enrolled: [...], skipped: [...], errors: [...] }
═══════════════════════════════════════════════════════════════════════════ */
exports.bulkEnroll = (req, res) => {
  const { enrollments } = req.body;
  if (!Array.isArray(enrollments) || !enrollments.length)
    return fail(res, 400, 'enrollments must be a non-empty array.');

  const enrolled = [], skipped = [], errors = [];

  enrollments.forEach((item, i) => {
    const label = `Item ${i + 1}`;
    const idx   = (db.admissions || []).findIndex(a => a.id === Number(item.admission_id));

    if (idx < 0) { errors.push({ item: label, reason: `Admission ${item.admission_id} not found.` }); return; }

    const admission = db.admissions[idx];
    if (admission.status !== 'Approved') { skipped.push({ item: label, reason: `Status is "${admission.status}", not Approved.` }); return; }

    const cls = item.class_id || admission.assignedClass;
    const arm = item.arm      || admission.assignedArm;
    if (!cls || !arm) { errors.push({ item: label, reason: 'class_id and arm are required.' }); return; }

    const clsObj = db.findClass(cls);
    if (!clsObj) { errors.push({ item: label, reason: `Class "${cls}" does not exist.` }); return; }

    const studentId = generateStudentId();
    const student   = {
      id: studentId, name: admission.applicantName, class: cls, arm,
      gender: admission.gender, dob: admission.dob,
      parent: admission.parentName, phone: admission.parentPhone,
      address: admission.address || '', attendance: 100, active: true,
    };

    if (!db.students) db.students = [];
    db.students.push(student);
    db.admissions[idx] = { ...admission, status: 'Enrolled', assignedClass: cls, assignedArm: arm, assignedStudentId: studentId };
    enrolled.push({ student, admission: db.admissions[idx] });
  });

  return res.status(207).json({
    success: enrolled.length > 0,
    enrolled: enrolled.length,
    skipped:  skipped.length,
    errors:   errors.length,
    data:     { enrolled, skipped, errors },
  });
};

/* ═══════════════════════════════════════════════════════════════════════════
   DELETE /api/admissions/:id
═══════════════════════════════════════════════════════════════════════════ */
exports.remove = (req, res) => {
  const idx = (db.admissions || []).findIndex(a => a.id === Number(req.params.id));
  if (idx < 0) return fail(res, 404, 'Admission record not found.');
  if (db.admissions[idx].status === 'Enrolled')
    return fail(res, 400, 'Cannot delete an enrolled admission. Remove the student record instead.');

  const [removed] = db.admissions.splice(idx, 1);
  return ok(res, removed, { message: `Admission ${removed.applicationNo} deleted.` });
};

/* ═══════════════════════════════════════════════════════════════════════════
   GET /api/admissions/export
   Query: format (csv|xlsx), status, session
   Returns CSV rows; xlsx requires SheetJS on the server — falls back to CSV.
═══════════════════════════════════════════════════════════════════════════ */
exports.exportAdmissions = (req, res) => {
  const { status, session } = req.query;
  let list = [...(db.admissions || [])];
  if (status)  list = list.filter(a => a.status  === status);
  if (session) list = list.filter(a => a.session === session);

  const headers = [
    'Application No', 'Applicant Name', 'Gender', 'DOB', 'Class Applied',
    'Preferred Arm', 'Session', 'Parent Name', 'Parent Phone', 'Parent Email',
    'Status', 'Applied At', 'Admitted At', 'Assigned Student ID',
  ];

  const rows = list.map(a => [
    a.applicationNo, a.applicantName, a.gender, a.dob,
    a.applyingForClass, a.preferred_arm, a.session,
    a.parentName, a.parentPhone, a.parentEmail,
    a.status, a.appliedAt, a.admittedAt || '', a.assignedStudentId || '',
  ]);

  const csv = [headers, ...rows]
    .map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\r\n');

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="admissions_export.csv"`);
  return res.send('\uFEFF' + csv);
};

/* ═══════════════════════════════════════════════════════════════════════════
   POST /api/admissions/:id/photo
   Stub — actual file is handled by Multer middleware before this controller.
   The middleware stores the file and sets req.file; we just record the path.
═══════════════════════════════════════════════════════════════════════════ */
exports.uploadPhoto = (req, res) => {
  const admission = (db.admissions || []).find(a => a.id === Number(req.params.id));
  if (!admission) return fail(res, 404, 'Admission record not found.');

  if (!req.file) return fail(res, 400, 'No file uploaded.');

  admission.photoUrl = req.file.path || req.file.filename;
  return ok(res, { photoUrl: admission.photoUrl }, { message: 'Photo uploaded successfully.' });
};