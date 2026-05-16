'use strict';

/**
 * admissionController.js — Sacred Heart College (SAHARCO)
 *
 * ALL reads and writes go directly to MySQL.
 * The in-memory db.admissions[] cache was the root cause of admission data
 * not persisting to the database — that bug is fixed here.
 */

const db = require('../config/db');

const VALID_STATUSES = ['Pending', 'Approved', 'Rejected', 'Enrolled', 'Draft'];

const fail = (res, status, msg, extra = {}) =>
  res.status(status).json({ success: false, message: msg, ...extra });

const ok = (res, data, meta = {}, status = 200) =>
  res.status(status).json({ success: true, ...meta, data });

/** Collision-free SHC/NNN — checks live database */
async function generateStudentId() {
  const rows = await db.query('SELECT id FROM students');
  const existing = new Set(rows.map(s => s.id));
  let n = existing.size + 1, id;
  do { id = `SHC/${String(n).padStart(3, '0')}`; n++; } while (existing.has(id));
  return id;
}

/** Normalise a DB row to the shape the frontend expects */
function normaliseRow(a) {
  if (!a) return null;
  const year = (a.acad_session || '').split('/')[1] || new Date().getFullYear();
  return {
    id:               a.id,
    applicationNo:    `ADM/${year}/${String(a.id).padStart(3, '0')}`,
    applicantName:    [a.first_name, a.middle_name, a.last_name].filter(Boolean).join(' '),
    first_name:       a.first_name,
    last_name:        a.last_name,
    middle_name:      a.middle_name    || '',
    gender:           a.gender,
    dob:              a.dob,
    blood_group:      a.blood_group    || '',
    genotype:         a.genotype       || '',
    state_origin:     a.state_origin   || '',
    lga:              a.lga            || '',
    address:          a.address        || '',
    applyingForClass: a.class_apply,
    class_apply:      a.class_apply,
    preferred_arm:    a.preferred_arm  || '',
    session:          a.acad_session,
    acad_session:     a.acad_session,
    entry_term:       a.entry_term     || '',
    prev_school:      a.prev_school    || '',
    last_class:       a.last_class     || '',
    parentName:       a.guardian_name  || '',
    guardian_name:    a.guardian_name  || '',
    parentPhone:      a.guardian_phone || '',
    guardian_phone:   a.guardian_phone || '',
    parentEmail:      a.guardian_email || '',
    guardian_email:   a.guardian_email || '',
    guardian_addr:    a.guardian_addr  || '',
    relation:         a.relation       || '',
    status:           a.status,
    appliedAt:        a.created_at ? String(a.created_at).slice(0, 10) : '',
    notes:            a.notes          || '',
  };
}

/* ── GET /api/admissions ─────────────────────────────────────────────────── */
exports.getAll = async (req, res) => {
  try {
    const { status, session, applyingForClass, search,
            page = '1', limit = '50' } = req.query;

    let sql = 'SELECT * FROM admissions WHERE 1=1';
    const params = [];
    if (status)           { sql += ' AND status=?';       params.push(status); }
    if (session)          { sql += ' AND acad_session=?'; params.push(session); }
    if (applyingForClass) { sql += ' AND class_apply=?';  params.push(applyingForClass); }
    if (search) {
      sql += ' AND (first_name LIKE ? OR last_name LIKE ? OR guardian_name LIKE ? OR guardian_phone LIKE ?)';
      const like = `%${search}%`;
      params.push(like, like, like, like);
    }

    const countRow = await db.query1(sql.replace('SELECT *', 'SELECT COUNT(*) AS total'), params);
    const total    = Number(countRow?.total) || 0;
    const pageNum  = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));
    sql += ` ORDER BY created_at DESC LIMIT ${limitNum} OFFSET ${(pageNum - 1) * limitNum}`;

    const rows = await db.query(sql, params);
    return res.json({
      success: true,
      data: rows.map(normaliseRow),
      total, page: pageNum, limit: limitNum,
      totalPages: Math.ceil(total / limitNum),
    });
  } catch (e) { return fail(res, 500, e.message); }
};

/* ── GET /api/admissions/stats ───────────────────────────────────────────── */
exports.getStats = async (req, res) => {
  try {
    const { session } = req.query;
    let sql = `SELECT COUNT(*) AS total,
      SUM(status='Pending') AS pending, SUM(status='Approved') AS approved,
      SUM(status='Enrolled') AS enrolled, SUM(status='Rejected') AS rejected,
      SUM(status='Draft') AS draft FROM admissions`;
    const params = [];
    if (session) { sql += ' WHERE acad_session=?'; params.push(session); }
    const row = await db.query1(sql, params);
    return res.json({ success: true, data: {
      total:    Number(row?.total)    || 0,
      pending:  Number(row?.pending)  || 0,
      approved: Number(row?.approved) || 0,
      enrolled: Number(row?.enrolled) || 0,
      rejected: Number(row?.rejected) || 0,
      draft:    Number(row?.draft)    || 0,
    }});
  } catch (e) { return fail(res, 500, e.message); }
};

/* ── GET /api/admissions/:id ─────────────────────────────────────────────── */
exports.getOne = async (req, res) => {
  try {
    const row = await db.query1('SELECT * FROM admissions WHERE id=?', [req.params.id]);
    if (!row) return fail(res, 404, `Admission ${req.params.id} not found.`);
    return ok(res, normaliseRow(row));
  } catch (e) { return fail(res, 500, e.message); }
};

/* ── POST /api/admissions ────────────────────────────────────────────────── */
exports.create = async (req, res) => {
  try {
    const {
      first_name, last_name, middle_name,
      gender, dob, blood_group, genotype,
      state_origin, lga, address,
      class_apply, preferred_arm, acad_session, entry_term,
      prev_school, last_class,
      guardian_last, guardian_first, guardian_name, relation,
      guardian_phone, guardian_email, guardian_addr,
      notes,
    } = req.body;

    const missing = [];
    if (!first_name)     missing.push('first_name');
    if (!last_name)      missing.push('last_name');
    if (!gender)         missing.push('gender');
    if (!dob)            missing.push('dob');
    if (!class_apply)    missing.push('class_apply');
    if (!acad_session)   missing.push('acad_session');
    if (!guardian_phone) missing.push('guardian_phone');
    if (!guardian_name && !guardian_last) missing.push('guardian_name');
    if (missing.length)  return fail(res, 400, `Missing required fields: ${missing.join(', ')}.`);

    if (!db.findClass(class_apply))
      return fail(res, 400, `Class "${class_apply}" does not exist.`);

    const resolvedGuardianName = guardian_name ||
      [guardian_first, guardian_last].filter(Boolean).map(s => s.trim()).join(' ');

    const result = await db.run(
      `INSERT INTO admissions
         (first_name, last_name, middle_name, gender, dob, blood_group, genotype,
          state_origin, lga, address, class_apply, preferred_arm, acad_session, entry_term,
          prev_school, last_class, guardian_name, guardian_phone, guardian_email,
          guardian_addr, relation, status, notes)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'Pending',?)`,
      [
        String(first_name).trim(), String(last_name).trim(), middle_name || null,
        gender, dob, blood_group || null, genotype || null,
        state_origin || null, lga || null, address || null,
        class_apply, preferred_arm || null, acad_session, entry_term || null,
        prev_school || null, last_class || null,
        resolvedGuardianName, String(guardian_phone).trim(),
        guardian_email || null, guardian_addr || null, relation || null,
        notes || null,
      ]
    );

    const saved = await db.query1('SELECT * FROM admissions WHERE id=?', [result.insertId]);
    return ok(res, normaliseRow(saved), {}, 201);
  } catch (e) { return fail(res, 500, e.message); }
};

/* ── PUT /api/admissions/:id ─────────────────────────────────────────────── */
exports.update = async (req, res) => {
  try {
    const row = await db.query1('SELECT * FROM admissions WHERE id=?', [req.params.id]);
    if (!row) return fail(res, 404, 'Admission record not found.');
    if (row.status === 'Enrolled')
      return fail(res, 400, 'Cannot edit an enrolled admission. Update the student record instead.');
    if (req.body.status && !VALID_STATUSES.includes(req.body.status))
      return fail(res, 400, `Status must be one of: ${VALID_STATUSES.join(', ')}.`);
    const newClass = req.body.class_apply || req.body.applyingForClass;
    if (newClass && !db.findClass(newClass))
      return fail(res, 400, `Class "${newClass}" does not exist.`);

    // Map aliases to DB columns
    const colMap = {
      first_name:'first_name', last_name:'last_name', middle_name:'middle_name',
      gender:'gender', dob:'dob', blood_group:'blood_group', genotype:'genotype',
      state_origin:'state_origin', lga:'lga', address:'address',
      class_apply:'class_apply', applyingForClass:'class_apply',
      preferred_arm:'preferred_arm', acad_session:'acad_session', session:'acad_session',
      entry_term:'entry_term', prev_school:'prev_school', last_class:'last_class',
      guardian_name:'guardian_name', guardian_phone:'guardian_phone', parentPhone:'guardian_phone',
      guardian_email:'guardian_email', parentEmail:'guardian_email',
      guardian_addr:'guardian_addr', relation:'relation',
      status:'status', notes:'notes',
    };
    const seen = new Set(), sets = [], vals = [];
    for (const [k, col] of Object.entries(colMap)) {
      if (req.body[k] !== undefined && !seen.has(col)) {
        sets.push(`${col}=?`); vals.push(req.body[k]); seen.add(col);
      }
    }
    if (!sets.length) return fail(res, 400, 'No fields to update.');
    vals.push(req.params.id);
    await db.run(`UPDATE admissions SET ${sets.join(',')} WHERE id=?`, vals);
    const updated = await db.query1('SELECT * FROM admissions WHERE id=?', [req.params.id]);
    return ok(res, normaliseRow(updated));
  } catch (e) { return fail(res, 500, e.message); }
};

/* ── PATCH /api/admissions/:id/approve ──────────────────────────────────── */
exports.approve = async (req, res) => {
  try {
    const row = await db.query1('SELECT * FROM admissions WHERE id=?', [req.params.id]);
    if (!row) return fail(res, 404, 'Admission record not found.');
    if (row.status === 'Enrolled') return fail(res, 400, 'Application is already enrolled.');
    if (row.status === 'Rejected') return fail(res, 400, 'A rejected application cannot be approved directly.');

    const { assignedClass, assignedArm, notes } = req.body;
    if (!assignedClass || !assignedArm) return fail(res, 400, 'assignedClass and assignedArm are required.');
    const cls = db.findClass(assignedClass);
    if (!cls) return fail(res, 400, `Class "${assignedClass}" does not exist.`);
    if (cls.arms?.length && !cls.arms.includes(assignedArm))
      return fail(res, 400, `Arm "${assignedArm}" is not valid for "${assignedClass}".`);

    await db.run(
      `UPDATE admissions SET status='Approved', class_apply=?, preferred_arm=?, notes=? WHERE id=?`,
      [assignedClass, assignedArm, notes !== undefined ? notes : row.notes, req.params.id]
    );
    const updated = await db.query1('SELECT * FROM admissions WHERE id=?', [req.params.id]);
    return ok(res, normaliseRow(updated));
  } catch (e) { return fail(res, 500, e.message); }
};

/* ── PATCH /api/admissions/:id/reject ───────────────────────────────────── */
exports.reject = async (req, res) => {
  try {
    const row = await db.query1('SELECT * FROM admissions WHERE id=?', [req.params.id]);
    if (!row) return fail(res, 404, 'Admission record not found.');
    if (row.status === 'Enrolled') return fail(res, 400, 'An enrolled student cannot be rejected.');
    const notes = req.body.notes !== undefined ? req.body.notes : row.notes;
    await db.run(`UPDATE admissions SET status='Rejected', notes=? WHERE id=?`, [notes, req.params.id]);
    const updated = await db.query1('SELECT * FROM admissions WHERE id=?', [req.params.id]);
    return ok(res, normaliseRow(updated));
  } catch (e) { return fail(res, 500, e.message); }
};

/* ── POST /api/admissions/:id/enroll ────────────────────────────────────── */
exports.enroll = async (req, res) => {
  try {
    const row = await db.query1('SELECT * FROM admissions WHERE id=?', [req.params.id]);
    if (!row) return fail(res, 404, 'Admission record not found.');
    if (row.status !== 'Approved') return fail(res, 400, 'Only Approved applications can be enrolled.');

    const cls = req.body.class_id || req.body.assignedClass || row.class_apply;
    const arm = req.body.arm      || row.preferred_arm;
    if (!cls || !arm) return fail(res, 400, 'Class and arm are required for enrollment.');

    const clsObj = db.findClass(cls);
    if (!clsObj) return fail(res, 400, `Class "${cls}" does not exist.`);
    if (clsObj.arms?.length && !clsObj.arms.includes(arm))
      return fail(res, 400, `Arm "${arm}" is not valid for "${cls}".`);

    const studentId = req.body.studentId || await generateStudentId();
    const existing  = await db.query1('SELECT id FROM students WHERE id=?', [studentId]);
    if (existing) return fail(res, 409, `Student ID "${studentId}" already exists.`);

    const fullName = [row.first_name, row.middle_name, row.last_name].filter(Boolean).join(' ');

    await db.run(
      `INSERT INTO students (id, name, class_id, arm, gender, dob, parent, phone, address, attendance, active, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 100, 1, 'active')`,
      [studentId, fullName, clsObj.id, arm, row.gender, row.dob,
       row.guardian_name || '', row.guardian_phone || '', row.address || '']
    );
    await db.run(
      `UPDATE admissions SET status='Enrolled', notes=CONCAT(IFNULL(notes,''), ' | Enrolled as ', ?) WHERE id=?`,
      [studentId, req.params.id]
    );

    // Sync in-memory cache
    const student = { id: studentId, name: fullName, class: cls, arm,
      gender: row.gender, dob: row.dob, parent: row.guardian_name || '',
      phone: row.guardian_phone || '', address: row.address || '',
      attendance: 100, active: true, status: 'active' };
    if (!db.students) db.students = [];
    db.students.push(student);

    const updatedAdmission = await db.query1('SELECT * FROM admissions WHERE id=?', [req.params.id]);
    return res.status(201).json({
      success: true,
      message: `"${fullName}" enrolled as ${studentId}.`,
      data: { student, admission: normaliseRow(updatedAdmission) },
    });
  } catch (e) { return fail(res, 500, e.message); }
};

/* ── POST /api/admissions/bulk-enroll ───────────────────────────────────── */
exports.bulkEnroll = async (req, res) => {
  try {
    const { enrollments } = req.body;
    if (!Array.isArray(enrollments) || !enrollments.length)
      return fail(res, 400, 'enrollments must be a non-empty array.');

    const enrolled = [], skipped = [], errors = [];

    for (let i = 0; i < enrollments.length; i++) {
      const item    = enrollments[i];
      const label   = `Item ${i + 1}`;
      const admission = await db.query1('SELECT * FROM admissions WHERE id=?', [item.admission_id]);

      if (!admission)                       { errors.push({ item: label, reason: `Admission ${item.admission_id} not found.` }); continue; }
      if (admission.status !== 'Approved')  { skipped.push({ item: label, reason: `Status is "${admission.status}", not Approved.` }); continue; }

      const cls = item.class_id || admission.class_apply;
      const arm = item.arm      || admission.preferred_arm;
      if (!cls || !arm)                     { errors.push({ item: label, reason: 'class_id and arm are required.' }); continue; }

      const clsObj = db.findClass(cls);
      if (!clsObj)                          { errors.push({ item: label, reason: `Class "${cls}" does not exist.` }); continue; }

      try {
        const studentId = await generateStudentId();
        const fullName  = [admission.first_name, admission.middle_name, admission.last_name].filter(Boolean).join(' ');
        await db.run(
          `INSERT INTO students (id, name, class_id, arm, gender, dob, parent, phone, address, attendance, active, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 100, 1, 'active')`,
          [studentId, fullName, clsObj.id, arm, admission.gender, admission.dob,
           admission.guardian_name || '', admission.guardian_phone || '', admission.address || '']
        );
        await db.run(
          `UPDATE admissions SET status='Enrolled', notes=CONCAT(IFNULL(notes,''), ' | Enrolled as ', ?) WHERE id=?`,
          [studentId, admission.id]
        );
        const student = { id: studentId, name: fullName, class: cls, arm,
          gender: admission.gender, dob: admission.dob,
          parent: admission.guardian_name || '', phone: admission.guardian_phone || '',
          address: admission.address || '', attendance: 100, active: true, status: 'active' };
        if (!db.students) db.students = [];
        db.students.push(student);
        const updatedAdmission = await db.query1('SELECT * FROM admissions WHERE id=?', [admission.id]);
        enrolled.push({ student, admission: normaliseRow(updatedAdmission) });
      } catch (e) {
        errors.push({ item: label, reason: e.message });
      }
    }

    return res.status(207).json({
      success: enrolled.length > 0,
      enrolled: enrolled.length, skipped: skipped.length, errors: errors.length,
      data: { enrolled, skipped, errors },
    });
  } catch (e) { return fail(res, 500, e.message); }
};

/* ── DELETE /api/admissions/:id ─────────────────────────────────────────── */
exports.remove = async (req, res) => {
  try {
    const row = await db.query1('SELECT * FROM admissions WHERE id=?', [req.params.id]);
    if (!row) return fail(res, 404, 'Admission record not found.');
    if (row.status === 'Enrolled')
      return fail(res, 400, 'Cannot delete an enrolled admission. Remove the student record instead.');
    await db.run('DELETE FROM admissions WHERE id=?', [req.params.id]);
    return ok(res, normaliseRow(row), { message: 'Admission deleted.' });
  } catch (e) { return fail(res, 500, e.message); }
};

/* ── GET /api/admissions/export ─────────────────────────────────────────── */
exports.exportAdmissions = async (req, res) => {
  try {
    const { status, session } = req.query;
    let sql = 'SELECT * FROM admissions WHERE 1=1';
    const params = [];
    if (status)  { sql += ' AND status=?';       params.push(status); }
    if (session) { sql += ' AND acad_session=?'; params.push(session); }
    sql += ' ORDER BY created_at DESC';

    const rows = await db.query(sql, params);
    const headers = ['ID','First Name','Last Name','Gender','DOB','Class Applied',
      'Preferred Arm','Session','Guardian Name','Guardian Phone','Guardian Email','Status','Applied At'];
    const csvRows = rows.map(a => [
      a.id, a.first_name, a.last_name, a.gender, a.dob,
      a.class_apply, a.preferred_arm||'', a.acad_session,
      a.guardian_name||'', a.guardian_phone||'', a.guardian_email||'',
      a.status, String(a.created_at||'').slice(0,10),
    ]);
    const csv = [headers, ...csvRows]
      .map(r => r.map(c => `"${String(c??'').replace(/"/g,'""')}"`).join(','))
      .join('\r\n');
    res.setHeader('Content-Type','text/csv; charset=utf-8');
    res.setHeader('Content-Disposition','attachment; filename="admissions_export.csv"');
    return res.send('\uFEFF' + csv);
  } catch (e) { return fail(res, 500, e.message); }
};

/* ── POST /api/admissions/:id/photo ─────────────────────────────────────── */
exports.uploadPhoto = async (req, res) => {
  try {
    const row = await db.query1('SELECT id FROM admissions WHERE id=?', [req.params.id]);
    if (!row) return fail(res, 404, 'Admission record not found.');
    if (!req.file) return fail(res, 400, 'No file uploaded.');
    const photoUrl = req.file.path || req.file.filename;
    await db.run(
      `UPDATE admissions SET notes=CONCAT(IFNULL(notes,''), ' [photo:', ?, ']') WHERE id=?`,
      [photoUrl, req.params.id]
    );
    return ok(res, { photoUrl }, { message: 'Photo uploaded successfully.' });
  } catch (e) { return fail(res, 500, e.message); }
};