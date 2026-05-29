'use strict';

/**
 * admissionController.js
 * All reads/writes go to MySQL. Table is auto-created on first use.
 */

const db = require('../config/db');

const VALID_STATUSES = ['Pending', 'Approved', 'Rejected', 'Enrolled', 'Draft'];

const fail = (res, status, msg) =>
  res.status(status).json({ success: false, message: msg });

const ok = (res, data, meta = {}, status = 200) =>
  res.status(status).json({ success: true, ...meta, data });

/* ── Ensure table exists ────────────────────────────────────────────────── */
const CREATE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS admissions (
    id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    first_name     VARCHAR(60)  NOT NULL,
    last_name      VARCHAR(60)  NOT NULL,
    middle_name    VARCHAR(60),
    gender         VARCHAR(10),
    dob            DATE,
    blood_group    VARCHAR(5),
    genotype       VARCHAR(5),
    state_origin   VARCHAR(60),
    lga            VARCHAR(60),
    address        TEXT,
    class_apply    VARCHAR(60),
    preferred_arm  VARCHAR(10),
    acad_session   VARCHAR(20),
    entry_term     VARCHAR(30),
    prev_school    VARCHAR(120),
    last_class     VARCHAR(60),
    guardian_name  VARCHAR(120),
    guardian_phone VARCHAR(20),
    guardian_email VARCHAR(160),
    guardian_addr  TEXT,
    relation       VARCHAR(40),
    status         VARCHAR(20)  NOT NULL DEFAULT 'Pending',
    notes          TEXT,
    created_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at     DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`;

let _tableReady = false;
async function ensureTable() {
  if (_tableReady) return;
  try {
    await db.run(CREATE_TABLE_SQL);
    _tableReady = true;
    console.log('[admissions] table ready');
  } catch (e) {
    console.error('[admissions] ensureTable error:', e.message);
  }
}

/* ── Normalise DB row ────────────────────────────────────────────────────── */
function normaliseRow(a) {
  if (!a) return null;
  // Support both old column names (from code) and actual DB column names
  const session    = a.session      || a.acad_session  || '';
  const cls        = a.applying_for_class || a.class_apply || a.assigned_class || '';
  const arm        = a.preferred_arm || a.assigned_arm || '';
  const gName      = a.parent_name  || a.guardian_name  || '';
  const gPhone     = a.parent_phone || a.guardian_phone || '';
  const gEmail     = a.parent_email || a.guardian_email || '';
  const gFirst     = a.guardian_first || '';
  const gLast      = a.guardian_last  || '';
  const year       = session.split('/')[1] || new Date().getFullYear();
  const appNo      = a.application_no || `ADM/${year}/${String(a.id).padStart(3,'0')}`;
  return {
    id:               a.id,
    applicationNo:    appNo,
    application_no:   appNo,
    applicantName:    a.applicant_name || [a.first_name, a.middle_name, a.last_name].filter(Boolean).join(' '),
    first_name:       a.first_name     || '',
    last_name:        a.last_name      || '',
    middle_name:      a.middle_name    || '',
    gender:           a.gender         || '',
    dob:              a.dob            || '',
    blood_group:      a.blood_group    || '',
    genotype:         a.genotype       || '',
    state_origin:     a.state_origin   || '',
    lga:              a.lga            || '',
    address:          a.address        || '',
    applyingForClass: cls,
    class_apply:      cls,
    applying_for_class: cls,
    preferred_arm:    arm,
    session:          session,
    acad_session:     session,
    entry_term:       a.entry_term     || '',
    prev_school:      a.prev_school    || '',
    last_class:       a.last_class     || '',
    parentName:       gName,
    guardian_name:    gName,
    parent_name:      gName,
    guardian_first:   gFirst,
    guardian_last:    gLast,
    parentPhone:      gPhone,
    guardian_phone:   gPhone,
    parent_phone:     gPhone,
    parentEmail:      gEmail,
    guardian_email:   gEmail,
    parent_email:     gEmail,
    guardian_addr:    a.guardian_addr  || '',
    relation:         a.relation       || '',
    status:           a.status         || 'Pending',
    appliedAt:        a.applied_at || (a.created_at ? String(a.created_at).slice(0,10) : ''),
    notes:            a.notes          || '',
    adm_no:           appNo,
    assignedClass:    a.assigned_class || cls,
    assignedArm:      a.assigned_arm   || arm,
  };
}

/* ── GET /api/admissions ─────────────────────────────────────────────────── */
exports.getAll = async (req, res) => {
  await ensureTable();
  try {
    const { status, session, applyingForClass, search,
            page = '1', limit = '50' } = req.query;

    let sql = 'SELECT * FROM admissions WHERE 1=1';
    const params = [];
    if (status)           { sql += ' AND status=?';       params.push(status); }
    if (session)          { sql += ' AND session=?'; params.push(session); }
    if (applyingForClass) { sql += ' AND applying_for_class=?'; params.push(applyingForClass); }
    if (search) {
      sql += ' AND (first_name LIKE ? OR last_name LIKE ? OR parent_name LIKE ? OR parent_phone LIKE ?)';
      const like = `%${search}%`;
      params.push(like, like, like, like);
    }

    const countRow = await db.query1(
      sql.replace('SELECT *', 'SELECT COUNT(*) AS total'), params
    );
    const total    = Number(countRow?.total) || 0;
    const pageNum  = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(200, Math.max(1, parseInt(limit) || 50));
    sql += ` ORDER BY created_at DESC LIMIT ${limitNum} OFFSET ${(pageNum - 1) * limitNum}`;

    const rows = await db.query(sql, params);
    return res.json({
      success: true,
      data: rows.map(normaliseRow),
      total, page: pageNum, limit: limitNum,
      totalPages: Math.ceil(total / limitNum),
    });
  } catch (e) {
    console.error('[admissions/getAll]', e.message, e.code);
    return res.json({ success: true, data: [], total: 0, page: 1, limit: 50, totalPages: 0 });
  }
};

/* ── GET /api/admissions/stats ───────────────────────────────────────────── */
exports.getStats = async (req, res) => {
  await ensureTable();
  const ZERO = { total:0, pending:0, approved:0, enrolled:0, rejected:0, draft:0 };
  try {
    const { session } = req.query;
    let sql = `SELECT COUNT(*) AS total,
      SUM(status='Pending')  AS pending,
      SUM(status='Approved') AS approved,
      SUM(status='Enrolled') AS enrolled,
      SUM(status='Rejected') AS rejected,
      SUM(status='Draft')    AS draft
      FROM admissions`;
    const params = [];
    if (session) { sql += ' WHERE session=?'; params.push(session); }
    const row = await db.query1(sql, params);
    return res.json({ success: true, data: {
      total:    Number(row?.total)    || 0,
      pending:  Number(row?.pending)  || 0,
      approved: Number(row?.approved) || 0,
      enrolled: Number(row?.enrolled) || 0,
      rejected: Number(row?.rejected) || 0,
      draft:    Number(row?.draft)    || 0,
    }});
  } catch (e) {
    console.error('[admissions/getStats]', e.message, e.code);
    return res.json({ success: true, data: ZERO });
  }
};

/* ── GET /api/admissions/:id ─────────────────────────────────────────────── */
exports.getOne = async (req, res) => {
  await ensureTable();
  try {
    const row = await db.query1('SELECT * FROM admissions WHERE id=?', [req.params.id]);
    if (!row) return fail(res, 404, `Admission ${req.params.id} not found.`);
    return ok(res, normaliseRow(row));
  } catch (e) { return fail(res, 500, e.message); }
};

/* ── POST /api/admissions ────────────────────────────────────────────────── */
exports.create = async (req, res) => {
  await ensureTable().catch(() => {}); // ignore — table was created by admin
  try {
    const {
      first_name, last_name, middle_name = null,
      gender, dob,
      blood_group = null, genotype = null,
      state_origin = null, lga = null, address = null,
      class_apply, preferred_arm = null,
      acad_session, entry_term = null,
      prev_school = null, last_class = null,
      guardian_last, guardian_first, guardian_name,
      relation = null, guardian_phone,
      guardian_email = null, guardian_addr = null,
      notes = null,
    } = req.body || {};

    // Validate required fields
    const missing = [];
    if (!first_name)     missing.push('first_name');
    if (!last_name)      missing.push('last_name');
    if (!gender)         missing.push('gender');
    if (!dob)            missing.push('dob');
    if (!class_apply)    missing.push('class_apply');
    if (!acad_session)   missing.push('acad_session');
    if (!guardian_phone) missing.push('guardian_phone');
    if (!guardian_name && !guardian_last && !guardian_first)
      missing.push('guardian_name');

    if (missing.length)
      return fail(res, 400, `Missing required fields: ${missing.join(', ')}.`);

    const gName = guardian_name ||
      [guardian_first, guardian_last].filter(Boolean).join(' ').trim() ||
      'Guardian';

    // Sanitise date — MySQL DATE requires YYYY-MM-DD
    const dobVal = (dob && String(dob).match(/^\d{4}-\d{2}-\d{2}$/)) ? dob : null;
    if (!dobVal) console.warn('[admissions/create] Invalid dob value:', dob);

    // Generate unique application number: ADM/YY/NNNN
    const year2d  = new Date().getFullYear().toString().slice(-2);
    const countRow = await db.query1('SELECT COUNT(*) AS n FROM admissions');
    const seqNum   = String((Number(countRow?.n) || 0) + 1).padStart(4, '0');
    const appNo    = `ADM/${year2d}/${seqNum}`;

    const result = await db.run(
      `INSERT INTO admissions
         (application_no, first_name, last_name, middle_name, gender, dob,
          blood_group, genotype, state_origin, lga, address,
          applying_for_class, preferred_arm, session, entry_term,
          prev_school, last_class,
          parent_name, guardian_first, guardian_last,
          parent_phone, parent_email, guardian_addr, relation,
          status, notes, applied_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'Pending',?,CURDATE())`,
      [
        appNo,
        String(first_name).trim(),
        String(last_name).trim(),
        middle_name    || null,
        gender,
        dobVal,
        blood_group    || null,
        genotype       || null,
        state_origin   || null,
        lga            || null,
        address        || null,
        class_apply,
        preferred_arm  || null,
        acad_session,
        entry_term     || null,
        prev_school    || null,
        last_class     || null,
        gName,
        guardian_first || null,
        guardian_last  || null,
        String(guardian_phone).trim(),
        guardian_email || null,
        guardian_addr  || null,
        relation       || null,
        notes          || null,
      ]
    );

    const saved = await db.query1(
      'SELECT * FROM admissions WHERE id=?', [result.insertId]
    );
    console.log(`[admissions] created id=${result.insertId} name="${first_name} ${last_name}"`);

    // Auto-send acknowledgement email to parent (non-blocking — never fails the request)
    if (saved && saved.parent_email) {
      setImmediate(async () => {
        try {
          const emailSvc = require('../services/emailService');
          const settings = await require('../config/db').getSettings().catch(() => ({}));
          const school   = {
            name:      settings.school_name      || 'Sacred Heart College Eziukwu Aba',
            address:   settings.school_address   || 'Aba, Abia State',
            phone:     settings.school_phone     || '',
            email:     settings.school_email     || '',
            principal: settings.principal_name   || 'The Principal',
          };
          const tmpl = emailSvc.templates.admissionAcknowledgement(normaliseRow(saved), school);
          await emailSvc.sendEmail({ to: saved.parent_email, ...tmpl });
          console.log('[admissions] ack email sent to', saved.parent_email);
        } catch(e) {
          console.warn('[admissions] ack email failed:', e.message);
        }
      });
    }

    return ok(res, normaliseRow(saved), {}, 201);

  } catch (e) {
    console.error('[admissions/create] ERROR:', e.message, '| CODE:', e.code, '| SQL:', e.sql?.slice(0,80));
    return fail(res, 500, `Database error: ${e.message}`);
  }
};

/* ── PUT /api/admissions/:id ─────────────────────────────────────────────── */
exports.update = async (req, res) => {
  await ensureTable();
  try {
    const row = await db.query1('SELECT * FROM admissions WHERE id=?', [req.params.id]);
    if (!row) return fail(res, 404, 'Admission record not found.');
    if (row.status === 'Enrolled')
      return fail(res, 400, 'Cannot edit an enrolled admission.');
    if (req.body.status && !VALID_STATUSES.includes(req.body.status))
      return fail(res, 400, `Status must be one of: ${VALID_STATUSES.join(', ')}.`);

    const colMap = {
      first_name:'first_name', last_name:'last_name', middle_name:'middle_name',
      gender:'gender', dob:'dob', blood_group:'blood_group', genotype:'genotype',
      state_origin:'state_origin', lga:'lga', address:'address',
      class_apply:'class_apply', applyingForClass:'class_apply',
      preferred_arm:'preferred_arm', acad_session:'acad_session', session:'acad_session',
      entry_term:'entry_term', prev_school:'prev_school', last_class:'last_class',
      guardian_name:'guardian_name', guardian_phone:'guardian_phone',
      guardian_email:'guardian_email', guardian_addr:'guardian_addr',
      relation:'relation', status:'status', notes:'notes',
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
  await ensureTable();
  try {
    const row = await db.query1('SELECT * FROM admissions WHERE id=?', [req.params.id]);
    if (!row) return fail(res, 404, 'Admission record not found.');
    if (row.status === 'Enrolled') return fail(res, 400, 'Already enrolled.');

    const { assignedClass, assignedArm, notes } = req.body;
    if (!assignedClass || !assignedArm)
      return fail(res, 400, 'assignedClass and assignedArm are required.');

    await db.run(
      `UPDATE admissions SET status='Approved', assigned_class=?, assigned_arm=?, applying_for_class=?, preferred_arm=?, notes=? WHERE id=?`,
      [assignedClass, assignedArm, assignedClass, assignedArm, notes ?? row.notes, req.params.id]
    );
    const updated = await db.query1('SELECT * FROM admissions WHERE id=?', [req.params.id]);
    return ok(res, normaliseRow(updated));
  } catch (e) { return fail(res, 500, e.message); }
};

/* ── PATCH /api/admissions/:id/reject ───────────────────────────────────── */
exports.reject = async (req, res) => {
  await ensureTable();
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
  await ensureTable();
  try {
    const row = await db.query1('SELECT * FROM admissions WHERE id=?', [req.params.id]);
    if (!row) return fail(res, 404, 'Admission record not found.');
    if (row.status !== 'Approved') return fail(res, 400, 'Only Approved applications can be enrolled.');

    const cls = req.body.assignedClass || row.assigned_class || row.applying_for_class || row.class_apply;
    const arm = req.body.arm           || row.assigned_arm  || row.preferred_arm;
    if (!cls || !arm) return fail(res, 400, 'Class and arm are required.');

    const clsObj = db.findClass(cls);
    if (!clsObj) return fail(res, 400, `Class "${cls}" does not exist.`);

    // Generate student ID
    const existing = await db.query('SELECT id FROM students');
    const ids = new Set(existing.map(s => s.id));
    let n = ids.size + 1, studentId;
    do { studentId = `SHC/${String(n).padStart(3,'0')}`; n++; } while (ids.has(studentId));

    const fullName = [row.first_name, row.middle_name, row.last_name].filter(Boolean).join(' ');

    await db.run(
      `INSERT INTO students (id, name, class_id, arm, gender, dob, parent, phone, address, attendance, active, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 100, 1, 'active')`,
      [studentId, fullName, clsObj.id, arm, row.gender, row.dob,
       row.guardian_name || '', row.guardian_phone || '', row.address || '']
    );
    await db.run(
      `UPDATE admissions SET status='Enrolled', assigned_student_id=?, admitted_at=CURDATE(), notes=CONCAT(IFNULL(notes,''),' | Enrolled as ',?) WHERE id=?`,
      [studentId, studentId, req.params.id]
    );

    const student = { id: studentId, name: fullName, class: cls, arm,
      gender: row.gender, dob: row.dob, parent: row.guardian_name || '',
      phone: row.guardian_phone || '', address: row.address || '',
      attendance: 100, active: true, status: 'active' };
    if (!db.students) db.students = [];
    db.students.push(student);

    const updated = await db.query1('SELECT * FROM admissions WHERE id=?', [req.params.id]);
    console.log(`[admissions] enrolled ${fullName} as ${studentId}`);
    return res.status(201).json({
      success: true,
      message: `"${fullName}" enrolled as ${studentId}.`,
      data: { student, admission: normaliseRow(updated) },
    });
  } catch (e) {
    console.error('[admissions/enroll]', e.message);
    return fail(res, 500, e.message);
  }
};

/* ── POST /api/admissions/bulk-enroll ───────────────────────────────────── */
exports.bulkEnroll = async (req, res) => {
  await ensureTable();
  try {
    const { enrollments } = req.body;
    if (!Array.isArray(enrollments) || !enrollments.length)
      return fail(res, 400, 'enrollments must be a non-empty array.');

    const enrolled = [], skipped = [], errors = [];
    for (let i = 0; i < enrollments.length; i++) {
      const item      = enrollments[i];
      const admission = await db.query1('SELECT * FROM admissions WHERE id=?', [item.admission_id]);
      if (!admission)                     { errors.push({ item: i+1, reason: 'Not found.' }); continue; }
      if (admission.status !== 'Approved'){ skipped.push({ item: i+1, reason: `Status: ${admission.status}` }); continue; }

      const cls = item.class_id || admission.applying_for_class || admission.class_apply;
      const arm = item.arm      || admission.assigned_arm || admission.preferred_arm;
      if (!cls || !arm) { errors.push({ item: i+1, reason: 'Missing class/arm.' }); continue; }

      const clsObj = db.findClass(cls);
      if (!clsObj) { errors.push({ item: i+1, reason: `Class "${cls}" not found.` }); continue; }

      try {
        const allIds   = new Set((await db.query('SELECT id FROM students')).map(s => s.id));
        let n = allIds.size + 1, studentId;
        do { studentId = `SHC/${String(n).padStart(3,'0')}`; n++; } while (allIds.has(studentId));

        const fullName = [admission.first_name, admission.middle_name, admission.last_name].filter(Boolean).join(' ');
        await db.run(
          `INSERT INTO students (id,name,class_id,arm,gender,dob,parent,phone,parent_email,address,attendance,active,status)
           VALUES (?,?,?,?,?,?,?,?,?,?,100,1,'active')`,
          [studentId, fullName, clsObj.id, arm, admission.gender, admission.dob,
           admission.parent_name||admission.guardian_name||'',
           admission.parent_phone||admission.guardian_phone||'',
           admission.parent_email||null,
           admission.address||'']
        );
        await db.run(
          `UPDATE admissions SET status='Enrolled', assigned_student_id=?, admitted_at=CURDATE(), notes=CONCAT(IFNULL(notes,''),' | Enrolled as ',?) WHERE id=?`,
          [studentId, studentId, admission.id]
        );
        const student = { id:studentId, name:fullName, class:cls, arm };
        if (!db.students) db.students = [];
        db.students.push(student);
        const updatedAdm = await db.query1('SELECT * FROM admissions WHERE id=?', [admission.id]);
        enrolled.push({ student, admission: normaliseRow(updatedAdm) });
      } catch (e) { errors.push({ item: i+1, reason: e.message }); }
    }
    return res.status(207).json({
      success:  enrolled.length > 0,
      enrolled: enrolled,
      skipped:  skipped,
      errors:   errors,
      data: { enrolled, skipped, errors },
      counts: { enrolled: enrolled.length, skipped: skipped.length, errors: errors.length },
    });
  } catch (e) { return fail(res, 500, e.message); }
};

/* ── DELETE /api/admissions/:id ─────────────────────────────────────────── */
exports.remove = async (req, res) => {
  await ensureTable();
  try {
    const row = await db.query1('SELECT * FROM admissions WHERE id=?', [req.params.id]);
    if (!row) return fail(res, 404, 'Admission record not found.');
    if (row.status === 'Enrolled')
      return fail(res, 400, 'Cannot delete an enrolled admission.');
    await db.run('DELETE FROM admissions WHERE id=?', [req.params.id]);
    return ok(res, normaliseRow(row), { message: 'Deleted.' });
  } catch (e) { return fail(res, 500, e.message); }
};

/* ── GET /api/admissions/export ─────────────────────────────────────────── */
exports.exportAdmissions = async (req, res) => {
  await ensureTable();
  try {
    const { status, session } = req.query;
    let sql = 'SELECT * FROM admissions WHERE 1=1';
    const params = [];
    if (status)  { sql += ' AND status=?';    params.push(status); }
    if (session) { sql += ' AND session=?';    params.push(session); }
    sql += ' ORDER BY created_at DESC';
    const rows  = await db.query(sql, params);
    const hd    = ['ID','First','Last','Gender','DOB','Class','Arm','Session','Guardian','Phone','Email','Status','Applied'];
    const lines = [hd, ...rows.map(a => [
      a.id, a.first_name, a.last_name, a.gender, a.dob,
      a.applying_for_class||'', a.preferred_arm||'', a.session||'',
      a.parent_name||'', a.parent_phone||'', a.parent_email||'',
      a.status, String(a.created_at||'').slice(0,10),
    ])].map(r => r.map(c => `"${String(c??'').replace(/"/g,'""')}"`).join(',')).join('\r\n');
    res.setHeader('Content-Type','text/csv; charset=utf-8');
    res.setHeader('Content-Disposition','attachment; filename="admissions_export.csv"');
    return res.send('\uFEFF' + lines);
  } catch (e) { return fail(res, 500, e.message); }
};

/* ── GET /api/admissions/debug ─────────────────────────────────────────────
   Admin-only diagnostic endpoint — returns table status and row count.
   Remove this in production if desired.
──────────────────────────────────────────────────────────────────────────── */
exports.debug = async (req, res) => {
  const result = {
    dbConnected: false, tableExists: false,
    insertTest: false, error: null, code: null,
    dbHost: process.env.DB_HOST || 'auth-db1777.hstgr.io',
    dbName: process.env.DB_NAME || 'u156099858_shcaba_db',
  };
  try {
    await db.query1('SELECT 1 AS ok');
    result.dbConnected = true;

    const row = await db.query1('SELECT COUNT(*) AS n FROM admissions');
    result.tableExists = true;
    result.rowCount    = Number(row?.n) || 0;

    // Test INSERT with exact same types the form sends
    const ins = await db.run(
      `INSERT INTO admissions
         (first_name, last_name, gender, dob, applying_for_class,
          session, parent_name, parent_phone, status, applied_at)
       VALUES (?,?,?,?,?,?,?,?,'Draft',CURDATE())`,
      ['TEST','TEST','Male','2010-01-15','JSS 1','2025/2026','Test Guardian','08012345678']
    );
    if (ins?.insertId) {
      await db.run('DELETE FROM admissions WHERE id=?', [ins.insertId]);
      result.insertTest = true;
    }
  } catch (e) {
    result.error = e.message;
    result.code  = e.code || null;
    result.sqlState = e.sqlState || null;
  }
  return res.json({ success: !result.error, data: result });
};