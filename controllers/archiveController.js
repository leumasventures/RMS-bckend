'use strict';
/**
 * archiveController.js — Former students and staff archive
 * Records are kept permanently for reference; source record is soft/hard deleted.
 */
const db   = require('../config/db');
const fail = (res, s, m) => res.status(s).json({ success: false, message: m });
const ok   = (res, data, meta = {}, s = 200) => res.status(s).json({ success: true, ...meta, data });

/* ══════════════════════════════════════════════════════════════════════════
   STUDENT ARCHIVE
══════════════════════════════════════════════════════════════════════════ */

/** GET /api/archive/students */
exports.getAllStudents = async (req, res) => {
  try {
    const { exit_reason, exit_year, search } = req.query;
    let sql = 'SELECT * FROM student_archive WHERE 1=1';
    const p = [];
    if (exit_reason) { sql += ' AND exit_reason=?'; p.push(exit_reason); }
    if (exit_year)   { sql += ' AND exit_year=?';   p.push(exit_year); }
    if (search) {
      sql += ' AND (name LIKE ? OR id LIKE ? OR parent LIKE ?)';
      const q = `%${search}%`; p.push(q, q, q);
    }
    sql += ' ORDER BY archived_at DESC';
    const rows = await db.query(sql, p);
    return ok(res, rows, { count: rows.length });
  } catch (e) { return fail(res, 500, e.message); }
};

/** GET /api/archive/students/:id */
exports.getOneStudent = async (req, res) => {
  try {
    const row = await db.query1('SELECT * FROM student_archive WHERE id=?', [req.params.id]);
    if (!row) return fail(res, 404, 'Archived student not found.');
    // Also get their historical results
    const results = await db.query('SELECT * FROM results WHERE student_id=? ORDER BY session, term', [req.params.id]);
    return ok(res, { ...row, results });
  } catch (e) { return fail(res, 500, e.message); }
};

/** POST /api/archive/students/:studentId — archive (exit) a student */
exports.archiveStudent = async (req, res) => {
  try {
    const { studentId } = req.params;
    const { exit_reason = 'Graduated', exit_note, exit_term, exit_session,
            forwarding_addr, certificate_no, final_gpa } = req.body ?? {};

    const student = await db.query1(
      `SELECT s.*, c.name AS class_name FROM students s
       LEFT JOIN classes c ON c.id=s.class_id WHERE s.id=?`, [studentId]);
    if (!student) return fail(res, 404, 'Student not found.');

    // Already archived?
    const exists = await db.query1('SELECT id FROM student_archive WHERE id=?', [studentId]);
    if (exists) return fail(res, 409, `Student ${studentId} is already in the archive.`);

    // Get admission year from created_at
    const admissionYear = student.created_at ? new Date(student.created_at).getFullYear().toString() : null;
    const exitYear      = exit_session ? exit_session.split('/')[1] : new Date().getFullYear().toString();

    await db.run(
      `INSERT INTO student_archive
       (id, name, last_class, last_arm, gender, dob, parent, phone, address,
        admission_year, exit_year, exit_term, exit_session, exit_reason, exit_note,
        final_gpa, certificate_no, forwarding_addr, archived_by, original_data)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [student.id, student.name, student.class_name, student.arm,
       student.gender, student.dob, student.parent, student.phone, student.address,
       admissionYear, exitYear, exit_term || null, exit_session || null,
       exit_reason, exit_note || null, final_gpa || null, certificate_no || null,
       forwarding_addr || null, req.user?.name || null,
       JSON.stringify(student)]
    );

    // Mark student as inactive (soft delete — preserves results/fees)
    await db.run(`UPDATE students SET active=0, status='left' WHERE id=?`, [studentId]);

    return ok(res, { id: studentId, archived: true, exit_reason },
      { message: `${student.name} has been archived as "${exit_reason}".` }, 201);
  } catch (e) { return fail(res, 500, e.message); }
};

/** DELETE /api/archive/students/:id/restore — re-enrol an archived student */
exports.restoreStudent = async (req, res) => {
  try {
    const archived = await db.query1('SELECT * FROM student_archive WHERE id=?', [req.params.id]);
    if (!archived) return fail(res, 404, 'Archived student not found.');
    await db.run(`UPDATE students SET active=1, status='active' WHERE id=?`, [req.params.id]);
    await db.run('DELETE FROM student_archive WHERE id=?', [req.params.id]);
    return ok(res, { id: req.params.id, restored: true,
      message: `${archived.name} has been restored to active students.` });
  } catch (e) { return fail(res, 500, e.message); }
};

/** GET /api/archive/students/export/csv */
exports.exportStudentsCSV = async (req, res) => {
  try {
    const rows = await db.query('SELECT * FROM student_archive ORDER BY exit_year DESC, name');
    const headers = ['ID','Name','Last Class','Arm','Gender','Exit Year','Exit Session','Exit Reason','Certificate No','Admission Year','Parent'];
    const lines = [headers.join(','), ...rows.map(r => [
      r.id, `"${r.name}"`, r.last_class||'', r.last_arm||'',
      r.gender||'', r.exit_year||'', r.exit_session||'',
      r.exit_reason, r.certificate_no||'', r.admission_year||'',
      `"${(r.parent||'').replace(/"/g,'""')}"`,
    ].join(','))];
    res.setHeader('Content-Type','text/csv');
    res.setHeader('Content-Disposition','attachment; filename="student_archive.csv"');
    return res.send('\uFEFF' + lines.join('\n'));
  } catch (e) { return fail(res, 500, e.message); }
};

/* ══════════════════════════════════════════════════════════════════════════
   STAFF ARCHIVE
══════════════════════════════════════════════════════════════════════════ */

/** GET /api/archive/staff */
exports.getAllStaff = async (req, res) => {
  try {
    const { exit_reason, exit_year, category, search } = req.query;
    let sql = 'SELECT * FROM staff_archive WHERE 1=1';
    const p = [];
    if (exit_reason) { sql += ' AND exit_reason=?'; p.push(exit_reason); }
    if (exit_year)   { sql += ' AND exit_year=?';   p.push(exit_year); }
    if (category)    { sql += ' AND category=?';    p.push(category); }
    if (search) {
      sql += ' AND (name LIKE ? OR id LIKE ? OR department LIKE ?)';
      const q = `%${search}%`; p.push(q, q, q);
    }
    sql += ' ORDER BY archived_at DESC';
    const rows = await db.query(sql, p);
    return ok(res, rows, { count: rows.length });
  } catch (e) { return fail(res, 500, e.message); }
};

/** GET /api/archive/staff/:id */
exports.getOneStaff = async (req, res) => {
  try {
    const row = await db.query1('SELECT * FROM staff_archive WHERE id=?', [req.params.id]);
    if (!row) return fail(res, 404, 'Archived staff not found.');
    return ok(res, row);
  } catch (e) { return fail(res, 500, e.message); }
};

/** POST /api/archive/staff/:staffId — archive (exit) a staff member */
exports.archiveStaff = async (req, res) => {
  try {
    const { staffId } = req.params;
    const { exit_reason = 'Resigned', exit_note, date_left,
            reference_given = 0 } = req.body ?? {};

    const staff = await db.query1(
      `SELECT st.*, c.name AS class_name FROM staff st
       LEFT JOIN classes c ON c.id=st.class_id WHERE st.id=?`, [staffId]);
    if (!staff) return fail(res, 404, 'Staff member not found.');

    const exists = await db.query1('SELECT id FROM staff_archive WHERE id=?', [staffId]);
    if (exists) return fail(res, 409, `Staff ${staffId} is already in the archive.`);

    const leftDate    = date_left || new Date().toISOString().slice(0,10);
    const exitYear    = leftDate.slice(0,4);
    let serviceYears  = null;
    if (staff.date_joined) {
      const ms = new Date(leftDate) - new Date(staff.date_joined);
      serviceYears = parseFloat((ms / (1000 * 60 * 60 * 24 * 365.25)).toFixed(1));
    }

    await db.run(
      `INSERT INTO staff_archive
       (id, name, gender, phone, email, date_joined, date_left, exit_year,
        category, position, department, subject, qualification, experience,
        exit_reason, exit_note, service_years, reference_given,
        last_class, last_arm, archived_by, original_data)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [staff.id, staff.name, staff.gender, staff.phone, staff.email,
       staff.date_joined, leftDate, exitYear,
       staff.category, staff.position, staff.department, staff.subject,
       staff.qualification, staff.experience,
       exit_reason, exit_note || null, serviceYears, reference_given ? 1 : 0,
       staff.class_name, staff.arm, req.user?.name || null,
       JSON.stringify(staff)]
    );

    // Mark staff as inactive
    await db.run(`UPDATE staff SET status='Resigned' WHERE id=?`, [staffId]);

    return ok(res, { id: staffId, archived: true, exit_reason, serviceYears },
      { message: `${staff.name} has been archived as "${exit_reason}".` }, 201);
  } catch (e) { return fail(res, 500, e.message); }
};

/** DELETE /api/archive/staff/:id/restore */
exports.restoreStaff = async (req, res) => {
  try {
    const archived = await db.query1('SELECT * FROM staff_archive WHERE id=?', [req.params.id]);
    if (!archived) return fail(res, 404, 'Archived staff not found.');
    await db.run(`UPDATE staff SET status='Active' WHERE id=?`, [req.params.id]);
    await db.run('DELETE FROM staff_archive WHERE id=?', [req.params.id]);
    return ok(res, { id: req.params.id, restored: true,
      message: `${archived.name} has been restored to active staff.` });
  } catch (e) { return fail(res, 500, e.message); }
};

/** GET /api/archive/staff/export/csv */
exports.exportStaffCSV = async (req, res) => {
  try {
    const rows = await db.query('SELECT * FROM staff_archive ORDER BY exit_year DESC, name');
    const headers = ['ID','Name','Gender','Category','Position','Department','Date Joined','Date Left','Exit Year','Service Years','Exit Reason','Reference Given'];
    const lines = [headers.join(','), ...rows.map(r => [
      r.id, `"${r.name}"`, r.gender||'', r.category||'', r.position||'', r.department||'',
      r.date_joined||'', r.date_left||'', r.exit_year||'',
      r.service_years||'', r.exit_reason, r.reference_given ? 'Yes' : 'No',
    ].join(','))];
    res.setHeader('Content-Type','text/csv');
    res.setHeader('Content-Disposition','attachment; filename="staff_archive.csv"');
    return res.send('\uFEFF' + lines.join('\n'));
  } catch (e) { return fail(res, 500, e.message); }
};

/** GET /api/archive/stats — counts for dashboard */
exports.getStats = async (req, res) => {
  try {
    const [sRow, stRow] = await Promise.all([
      db.query1('SELECT COUNT(*) AS cnt FROM student_archive'),
      db.query1('SELECT COUNT(*) AS cnt FROM staff_archive'),
    ]);
    const byReason = await db.query(
      `SELECT exit_reason, COUNT(*) AS cnt FROM student_archive GROUP BY exit_reason`);
    return ok(res, {
      archivedStudents: Number(sRow?.cnt || 0),
      archivedStaff:    Number(stRow?.cnt || 0),
      byReason,
    });
  } catch (e) { return fail(res, 500, e.message); }
};