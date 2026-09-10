/* ============================================================
   Sacred Heart College Eziukwu Aba – School Portal
   controllers/parentPortalController.js
   DB-backed — no hardcoded student IDs.
   ============================================================ */

'use strict';
const db   = require('../config/db');
const fail = (res, s, m) => res.status(s).json({ success:false, message:m });
const ok   = (res, d, meta={}) => res.status(200).json({ success:true, ...meta, data:d });

/* ── helpers ─────────────────────────────────────────────── */
function grade(total) {
  if (total >= 70) return { letter:'A', remark:'Excellent' };
  if (total >= 60) return { letter:'B', remark:'Very Good' };
  if (total >= 50) return { letter:'C', remark:'Good' };
  if (total >= 45) return { letter:'D', remark:'Pass' };
  if (total >= 40) return { letter:'E', remark:'Fairly Pass' };
  return { letter:'F', remark:'Fail' };
}

/* ── getChildren: list all wards for a parent account ────── */
exports.getChildren = async (req, res) => {
  try {
    const user = req.user;
    if (!user) return fail(res, 401, 'Not authenticated.');
    // For a linked parent, return their single ward
    if (user.ward_id || user.wardId) {
      const wardId = user.ward_id || user.wardId;
      const s = await db.query1(
        `SELECT s.id, s.name, s.gender, s.arm,
                c.name AS class_name, c.level AS class_level
         FROM students s LEFT JOIN classes c ON c.id=s.class_id
         WHERE s.id=?`, [wardId]
      );
      return ok(res, s ? [{ ...s, class:s.class_name, studentId:s.id }] : []);
    }
    return ok(res, []);
  } catch(e) { return fail(res, 500, e.message); }
};

/* ── getStudentSummary ────────────────────────────────────── */
exports.getStudentSummary = async (req, res) => {
  try {
    const { studentId } = req.params;
    const student = await db.query1(
      `SELECT s.*, c.name AS class_name, c.level AS class_level
       FROM students s LEFT JOIN classes c ON c.id=s.class_id WHERE s.id=?`, [studentId]
    );
    if (!student) return fail(res, 404, 'Student not found.');

    const { term, session } = req.query;
    const tq = term    || db._settings?.current_term    || 'First Term';
    const sq = session || db._settings?.current_session || '';

    const results = await db.query(
      `SELECT ca, exam, (COALESCE(total, ca+exam)) AS total, subject_name
       FROM results WHERE student_id=? AND term=? AND session=?
       ORDER BY subject_name`,
      [studentId, tq, sq]
    );

    const count = results.length;
    const totalScore = results.reduce((s,r)=>s+(Number(r.ca||0)+Number(r.exam||0)),0);
    const avg = count ? parseFloat((totalScore/count).toFixed(1)) : 0;
    const attendance = parseFloat(student.attendance || 0);

    return ok(res, {
      studentId: student.id,
      name:      student.name,
      class:     student.class_name || '',
      arm:       student.arm || '',
      session:   sq, term: tq,
      avg, rank: '—', classSize: 0,
      attendance, trend: '',
      subjectCount: count,
    });
  } catch(e) { return fail(res, 500, e.message); }
};

/* ── getSubjectScores ─────────────────────────────────────── */
exports.getSubjectScores = async (req, res) => {
  try {
    const { studentId } = req.params;
    const { term, session } = req.query;
    const tq = term    || db._settings?.current_term    || 'First Term';
    const sq = session || db._settings?.current_session || '';

    const rows = await db.query(
      `SELECT ca, exam, COALESCE(total, ca+exam) AS total, subject_name
       FROM results WHERE student_id=? AND term=? AND session=? ORDER BY subject_name`,
      [studentId, tq, sq]
    );
    const subjects = rows.map(r => {
      const tot = Number(r.ca||0) + Number(r.exam||0);
      const g   = grade(tot);
      return { name: r.subject_name, ca: r.ca, exam: r.exam,
               total: tot, grade: g.letter, remark: g.remark };
    });
    return ok(res, { subjects, term: tq, session: sq });
  } catch(e) { return fail(res, 500, e.message); }
};

/* ── getAttendance ────────────────────────────────────────── */
exports.getAttendance = async (req, res) => {
  try {
    const { studentId } = req.params;
    const { term, session } = req.query;
    const tq = term    || db._settings?.current_term    || 'First Term';
    const sq = session || db._settings?.current_session || '';

    const rows = await db.query(
      `SELECT date, status FROM attendance
       WHERE student_id=? AND term=? AND session=? ORDER BY date DESC`,
      [studentId, tq, sq]
    ).catch(()=>[]);

    const total   = rows.length;
    const present = rows.filter(r=>r.status==='Present').length;
    const pct     = total ? Math.round(present/total*100) : 0;
    return ok(res, { percentage: pct, present, total, records: rows.slice(0,30) });
  } catch(e) { return fail(res, 500, e.message); }
};

/* ── getRecentAssessments ─────────────────────────────────── */
exports.getRecentAssessments = async (req, res) => {
  try {
    const { studentId } = req.params;
    const rows = await db.query(
      `SELECT term, session, subject_name,
              COALESCE(total, ca+exam) AS total, ca, exam
       FROM results WHERE student_id=? ORDER BY id DESC LIMIT 10`,
      [studentId]
    );
    return ok(res, rows.map(r=>({
      subject: r.subject_name,
      total:   Number(r.ca||0)+Number(r.exam||0),
      ca: r.ca, exam: r.exam, term: r.term, session: r.session,
    })));
  } catch(e) { return fail(res, 500, e.message); }
};

/* ── getAllTermsResult ─────────────────────────────────────── */
exports.getAllTermsResult = async (req, res) => {
  try {
    const { studentId } = req.params;
    const rows = await db.query(
      `SELECT term, session,
              AVG(COALESCE(total, ca+exam)) AS avg,
              COUNT(*) AS subjects
       FROM results WHERE student_id=?
       GROUP BY term, session ORDER BY session DESC, term`,
      [studentId]
    );
    return ok(res, rows.map(r=>({
      term: r.term, session: r.session,
      avg:  parseFloat(parseFloat(r.avg||0).toFixed(1)),
      subjects: r.subjects,
    })));
  } catch(e) { return fail(res, 500, e.message); }
};