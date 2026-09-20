'use strict';
const db = require('../config/db');

const fail = (res, s, m) => res.status(s).json({ success: false, message: m });
const ok   = (res, data, meta = {}, s = 200) => res.status(s).json({ success: true, ...meta, data });

function withTotal(row) {
  const ca   = Number(row.ca   ?? 0);
  const exam = Number(row.exam ?? 0);
  return { ...row, studentId: row.student_id, subject: row.subject_name, ca, exam, total: ca + exam };
}

/* ── GET /api/transcript?studentId=...&session=... ──────────────────────
   Admin-only. All results for a student across all sessions/terms
   (or filtered to one session if provided). */
exports.getTranscript = async (req, res) => {
  try {
    const { studentId, session } = req.query;
    if (!studentId) return fail(res, 400, 'studentId is required.');

    const student = await db.query1(
      `SELECT s.*, c.name AS class_name FROM students s
       LEFT JOIN classes c ON c.id = s.class_id WHERE s.id = ?`,
      [studentId]
    );
    if (!student) return fail(res, 404, 'Student not found.');

    const rows = await db.query(
      `SELECT * FROM results WHERE student_id = ?${session ? ' AND session = ?' : ''}
       ORDER BY session DESC, term, subject_name`,
      session ? [studentId, session] : [studentId]
    );

    return ok(res, rows.map(withTotal), { count: rows.length, student });
  } catch (e) {
    console.error('[transcriptController.getTranscript]', e.message);
    return fail(res, 500, e.message);
  }
};

/* ── GET /api/transcript/profile?studentId=...&term=...&session=... ─────
   Admin-only. Bio + results + attendance + domain assessment + remarks
   in one call, mirroring studentController.getReportCard's query shape. */
exports.getProfile = async (req, res) => {
  try {
    const { studentId, term, session } = req.query;
    if (!studentId) return fail(res, 400, 'studentId is required.');

    const student = await db.query1(
      `SELECT s.*, c.name AS class_name FROM students s
       LEFT JOIN classes c ON c.id = s.class_id WHERE s.id = ?`,
      [studentId]
    );
    if (!student) return fail(res, 404, 'Student not found.');

    const resultsSql = term && session
      ? `SELECT * FROM results WHERE student_id=? AND term=? AND session=? ORDER BY subject_name`
      : `SELECT * FROM results WHERE student_id=?${session ? ' AND session=?' : ''} ORDER BY session DESC, term, subject_name`;
    const resultsParams = term && session ? [studentId, term, session]
      : (session ? [studentId, session] : [studentId]);

    const attendanceSql = term && session
      ? `SELECT * FROM attendance WHERE student_id=? AND term=? AND session=? ORDER BY date`
      : `SELECT * FROM attendance WHERE student_id=?${session ? ' AND session=?' : ''} ORDER BY date`;
    const attendanceParams = term && session ? [studentId, term, session]
      : (session ? [studentId, session] : [studentId]);

    const [results, attendance, remark, domain] = await Promise.all([
      db.query(resultsSql, resultsParams),
      db.query(attendanceSql, attendanceParams),
      term && session
        ? db.query1('SELECT * FROM report_card_remarks WHERE student_id=? AND term=? AND session=?', [studentId, term, session])
        : Promise.resolve(null),
      term && session
        ? db.query1('SELECT * FROM domain_assessments WHERE student_id=? AND term=? AND session=?', [studentId, term, session])
        : Promise.resolve(null),
    ]);

    const counts = { p: 0, l: 0, a: 0, e: 0 };
    attendance.forEach(r => { if (counts[r.status] !== undefined) counts[r.status]++; });

    return ok(res, {
      student,
      results: results.map(withTotal),
      attendance,
      attendanceCounts: counts,
      domains: domain || null,
      remarks: remark || {},
    });
  } catch (e) {
    console.error('[transcriptController.getProfile]', e.message);
    return fail(res, 500, e.message);
  }
};