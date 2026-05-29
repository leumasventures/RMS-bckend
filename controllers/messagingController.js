'use strict';
const db      = require('../config/db');
const email   = require('../services/emailService');

const fail = (res, s, m) => res.status(s).json({ success: false, message: m });
const ok   = (res, data, meta = {}) => res.json({ success: true, ...meta, data });

/* ── Helpers ────────────────────────────────────────────────────────────── */
async function getSchoolInfo() {
  const settings = await db.getSettings().catch(() => ({}));
  return {
    name:      settings.school_name     || 'Sacred Heart College Eziukwu Aba',
    address:   settings.school_address  || 'Aba, Abia State, Nigeria',
    phone:     settings.school_phone    || '',
    email:     settings.school_email    || '',
    principal: settings.principal_name  || 'The Principal',
    website:   settings.school_website  || 'https://sacredheartcollegeaba.com',
  };
}

/* Build recipient list from students with parent email */
async function buildParentRecipients({ classFilter, armFilter, studentIds }) {
  let sql = `
    SELECT s.id AS studentId, s.name AS studentName,
           s.parent AS parentName, s.phone AS parentPhone,
           u.email
    FROM students s
    LEFT JOIN users u ON u.student_id = s.id OR u.ward_id = s.id
    WHERE s.active = 1
  `;
  const params = [];
  if (classFilter) { sql += ' AND s.class_id IN (SELECT id FROM classes WHERE name=?)'; params.push(classFilter); }
  if (armFilter)   { sql += ' AND s.arm=?'; params.push(armFilter); }
  if (studentIds?.length) {
    sql += ` AND s.id IN (${studentIds.map(()=>'?').join(',')})`;
    params.push(...studentIds);
  }

  let rows = await db.query(sql, params);

  // Also try parent email stored directly on students table
  const fallback = await db.query(`
    SELECT s.id AS studentId, s.name AS studentName,
           s.parent AS parentName, s.phone AS parentPhone,
           s.email
    FROM students s WHERE s.active = 1 AND s.email IS NOT NULL AND s.email != ''
    ${classFilter ? "AND s.class_id IN (SELECT id FROM classes WHERE name=?)" : ""}
    ${armFilter   ? "AND s.arm=?" : ""}
    ${studentIds?.length ? `AND s.id IN (${studentIds.map(()=>'?').join(',')})` : ""}
  `, [
    ...(classFilter ? [classFilter] : []),
    ...(armFilter   ? [armFilter]   : []),
    ...(studentIds?.length ? studentIds : []),
  ]).catch(() => []);

  // Merge — prefer users.email, fall back to students.email
  const byStudent = {};
  rows.forEach(r => { byStudent[r.studentId] = r; });
  fallback.forEach(r => {
    if (!byStudent[r.studentId]?.email && r.email) byStudent[r.studentId] = r;
  });

  return Object.values(byStudent).filter(r => r.email);
}

/* Build applicant recipients from admissions table */
async function buildApplicantRecipients({ statusFilter = 'Pending', appNos }) {
  let sql = `SELECT id, first_name, last_name, parent_name, parent_phone, parent_email,
                    applying_for_class, session, application_no
             FROM admissions WHERE 1=1`;
  const params = [];
  if (statusFilter !== 'All') { sql += ' AND status=?'; params.push(statusFilter); }
  if (appNos?.length) {
    sql += ` AND application_no IN (${appNos.map(()=>'?').join(',')})`;
    params.push(...appNos);
  }

  const rows = await db.query(sql, params);
  return rows
    .filter(r => r.parent_email)
    .map(r => ({
      studentId:   null,
      studentName: [r.first_name, r.last_name].filter(Boolean).join(' '),
      name:        [r.first_name, r.last_name].filter(Boolean).join(' '),
      parentName:  r.parent_name,
      parentPhone: r.parent_phone,
      email:       r.parent_email,
      appNo:       r.application_no,
      class:       r.applying_for_class,
      session:     r.session,
    }));
}

/* ── Log sent messages ──────────────────────────────────────────────────── */
async function logMessages(messages, meta) {
  try {
    for (const m of messages) {
      await db.run(
        `INSERT INTO message_log (recipient_email, recipient_name, subject, status, sent_by, sent_at)
         VALUES (?,?,?,?,?,NOW())`,
        [m.email, m.name, meta.subject, m.success ? 'sent' : 'failed', meta.sentBy || 'Admin']
      ).catch(() => {}); // non-critical
    }
  } catch(e) { console.warn('[messaging] log failed:', e.message); }
}

/* ═══════════════════════════════════════════════════════════════
   CONTROLLERS
═══════════════════════════════════════════════════════════════ */

/* ── POST /api/messaging/send ────────────────────────────────────────────
   Body:
   {
     type: 'class' | 'individual' | 'applicants',
     subject: string,
     body: string,
     -- for type='class':
     classFilter: 'JSS 1',
     armFilter: 'A'    (optional — all arms if omitted),
     -- for type='individual':
     studentIds: ['SHC/001', 'SHC/002'],
     -- for type='applicants':
     applicantStatus: 'Pending' | 'Approved' | 'All',
     applicationNos: ['ADM/25/001'],
   }
─────────────────────────────────────────────────────────────────── */
exports.send = async (req, res) => {
  try {
    const { type, subject, body, classFilter, armFilter,
            studentIds, applicantStatus, applicationNos } = req.body || {};

    if (!type)    return fail(res, 400, 'type is required.');
    if (!subject) return fail(res, 400, 'subject is required.');
    if (!body)    return fail(res, 400, 'message body is required.');

    const school = await getSchoolInfo();
    let recipients = [];

    if (type === 'class' || type === 'individual') {
      recipients = await buildParentRecipients({
        classFilter: type === 'class' ? classFilter : undefined,
        armFilter:   type === 'class' ? armFilter   : undefined,
        studentIds:  type === 'individual' ? studentIds : undefined,
      });
    } else if (type === 'applicants') {
      recipients = await buildApplicantRecipients({
        statusFilter: applicantStatus || 'Pending',
        appNos:       applicationNos,
      });
    } else {
      return fail(res, 400, `Unknown type "${type}". Use class | individual | applicants.`);
    }

    if (!recipients.length) {
      return ok(res, { sent: 0, failed: 0, noEmail: true, total: 0 },
        { message: 'No recipients with email addresses found.' });
    }

    // Send emails
    const results = await email.sendBulk(
      recipients,
      subject,
      (r) => email.templates.custom(
        { name: r.parentName || r.name || r.studentName },
        subject, body, school
      ).html,
      { delayMs: 300 }
    );

    // Log
    await logMessages([
      ...results.sent.map(r => ({ ...r, success: true })),
      ...results.failed.map(r => ({ ...r, success: false })),
    ], { subject, sentBy: req.user?.name || 'Admin' });

    return ok(res, {
      sent:    results.sent.length,
      failed:  results.failed.length,
      total:   recipients.length,
      details: results,
    }, { message: `${results.sent.length} message(s) sent, ${results.failed.length} failed.` });

  } catch (e) {
    console.error('[messaging/send]', e.message);
    return fail(res, 500, e.message);
  }
};

/* ── POST /api/messaging/send-admission-ack ─────────────────────────────── */
exports.sendAdmissionAck = async (req, res) => {
  try {
    const { admissionId } = req.body || {};
    const row = await db.query1('SELECT * FROM admissions WHERE id=?', [admissionId]);
    if (!row) return fail(res, 404, 'Admission not found.');
    if (!row.parent_email) return fail(res, 400, 'No parent email on this admission.');

    const school = await getSchoolInfo();
    const tmpl   = email.templates.admissionAcknowledgement(row, school);

    await email.sendEmail({ to: row.parent_email, ...tmpl });
    return ok(res, { sent: true, to: row.parent_email });
  } catch (e) { return fail(res, 500, e.message); }
};

/* ── POST /api/messaging/send-approval ─────────────────────────────────── */
exports.sendApproval = async (req, res) => {
  try {
    const { admissionId } = req.body || {};
    const row = await db.query1('SELECT * FROM admissions WHERE id=?', [admissionId]);
    if (!row) return fail(res, 404, 'Admission not found.');
    if (!row.parent_email) return fail(res, 400, 'No parent email on this admission.');

    const school = await getSchoolInfo();
    const tmpl   = email.templates.admissionApproved(row, school);

    await email.sendEmail({ to: row.parent_email, ...tmpl });
    return ok(res, { sent: true, to: row.parent_email });
  } catch (e) { return fail(res, 500, e.message); }
};

/* ── GET /api/messaging/preview ─────────────────────────────────────────── */
exports.preview = async (req, res) => {
  const { type, classFilter, armFilter, studentIds, applicantStatus } = req.query;
  try {
    let recipients = [], total = 0, withEmail = 0, withoutEmail = 0;
    if (type === 'class' || type === 'individual') {
      const ids = studentIds ? studentIds.split(',') : undefined;
      const all = await db.query(
        `SELECT s.id, s.name FROM students s
         WHERE s.active=1
         ${classFilter ? "AND s.class_id IN (SELECT id FROM classes WHERE name=?)" : ""}
         ${armFilter   ? "AND s.arm=?" : ""}
         ${ids?.length ? `AND s.id IN (${ids.map(()=>'?').join(',')})` : ""}`,
        [...(classFilter?[classFilter]:[]), ...(armFilter?[armFilter]:[]), ...(ids||[])]
      );
      total = all.length;
      const recs = await buildParentRecipients({
        classFilter: type==='class' ? classFilter : undefined,
        armFilter:   type==='class' ? armFilter   : undefined,
        studentIds:  type==='individual' ? ids : undefined,
      });
      withEmail    = recs.length;
      withoutEmail = total - withEmail;
      recipients   = recs.slice(0, 10);
    } else if (type === 'applicants') {
      const recs = await buildApplicantRecipients({ statusFilter: applicantStatus || 'Pending' });
      total = recs.length; withEmail = recs.length;
      recipients = recs.slice(0, 10);
    }
    return ok(res, { total, withEmail, withoutEmail, preview: recipients });
  } catch (e) { return fail(res, 500, e.message); }
};

/* ── GET /api/messaging/log ─────────────────────────────────────────────── */
exports.getLog = async (req, res) => {
  try {
    await db.run(`CREATE TABLE IF NOT EXISTS message_log (
      id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      recipient_email VARCHAR(160),
      recipient_name  VARCHAR(120),
      subject         VARCHAR(255),
      status          VARCHAR(20) DEFAULT 'sent',
      sent_by         VARCHAR(80),
      sent_at         DATETIME DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`).catch(()=>{});

    const rows = await db.query(
      'SELECT * FROM message_log ORDER BY sent_at DESC LIMIT 200'
    );
    return ok(res, rows, { count: rows.length });
  } catch (e) { return fail(res, 500, e.message); }
};

/* ── GET /api/messaging/status ──────────────────────────────────────────── */
exports.getStatus = async (req, res) => {
  try {
    const transporter = email.isEnabled();
    let canConnect = false;
    if (transporter) {
      try { await require('../services/emailService').sendEmail; canConnect = true; } catch(e) {}
    }
    return ok(res, {
      enabled:     email.isEnabled(),
      emailUser:   process.env.EMAIL_USER || null,
      emailHost:   process.env.EMAIL_HOST || 'smtp.gmail.com',
      configured:  !!(process.env.EMAIL_USER && process.env.EMAIL_PASS),
    });
  } catch (e) { return fail(res, 500, e.message); }
};