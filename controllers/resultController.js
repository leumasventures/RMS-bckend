'use strict';
const db = require('../config/db');
const fail = (res, s, m) => res.status(s).json({ success: false, message: m });
const ok   = (res, data, meta = {}, s = 200) => res.status(s).json({ success: true, ...meta, data });

function grade(score) {
  const g = db.gradeScore(score);
  return { grade: g.grade, remark: g.remark };
}

exports.getAll = async (req, res) => {
  try {
    const { studentId, class: cls, arm, term, session, subject } = req.query;
    let sql = `SELECT r.*, s.name AS student_name, c.name AS class_name
               FROM results r
               JOIN students s ON s.id=r.student_id
               LEFT JOIN classes c ON c.id=r.class_id WHERE 1=1`;
    const p = [];
    if (studentId) { sql += ' AND r.student_id=?'; p.push(studentId); }
    if (cls)       { sql += ' AND c.name=?';        p.push(cls); }
    if (arm)       { sql += ' AND r.arm=?';         p.push(arm); }
    if (term)      { sql += ' AND r.term=?';        p.push(term); }
    if (session)   { sql += ' AND r.session=?';     p.push(session); }
    if (subject)   { sql += ' AND r.subject_name=?';p.push(subject); }
    sql += ' ORDER BY s.name, r.subject_name';
    const rows = await db.query(sql, p);
    return ok(res, rows.map(r => {
      const ca   = Number(r.ca   ?? 0);
      const exam = Number(r.exam ?? 0);
      const tot  = ca + exam;   // always recompute — never trust DB GENERATED column
      const g    = grade(tot);
      return { ...r, studentId: r.student_id, subject: r.subject_name,
               ca, exam, total: tot, gradeLabel: g.grade, remark: g.remark };
    }), { count: rows.length });
  } catch (e) { return fail(res, 500, e.message); }
};

exports.create = async (req, res) => {
  try {
    const { studentId, subject, term, session, ca, exam } = req.body ?? {};
    if (!studentId || !subject || !term || !session)
      return fail(res, 400, 'studentId, subject, term, session are required.');

    const student = await db.query1(`SELECT s.*, c.name AS class_name FROM students s
      LEFT JOIN classes c ON c.id=s.class_id WHERE s.id=?`, [studentId]);
    if (!student) return fail(res, 404, 'Student not found.');

    const maxCA   = db.getMaxCA();
    const maxExam = db.getMaxExam();
    const caVal   = Math.min(maxCA,   Math.max(0, parseInt(ca)   || 0));
    const examVal = Math.min(maxExam, Math.max(0, parseInt(exam) || 0));
    const total   = caVal + examVal;

    const subj    = db.subjects.find(s => s.name === subject || s.code === subject);
    const classId = student.class_id;

    // SS2/SS3 cap
    if (['SS 2','SS 3'].includes(student.class_name)) {
      const cnt = await db.query1(
        'SELECT COUNT(DISTINCT subject_name) AS n FROM results WHERE student_id=? AND term=? AND session=?',
        [studentId, term, session]);
      const existing = await db.query1(
        'SELECT id FROM results WHERE student_id=? AND subject_name=? AND term=? AND session=?',
        [studentId, subject, term, session]);
      if (!existing && Number(cnt?.n) >= 9)
        return fail(res, 400, `${student.class_name} students may not exceed 9 subjects.`);
    }

    await db.run(
      `INSERT INTO results (student_id, class_id, arm, subject_id, subject_name, term, session, ca, exam, total)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE ca=VALUES(ca), exam=VALUES(exam), total=VALUES(total)`,
      [studentId, classId, student.arm, subj?.id || null, subject, term, session, caVal, examVal]
    );

    const saved = await db.query1(
      'SELECT * FROM results WHERE student_id=? AND subject_name=? AND term=? AND session=?',
      [studentId, subject, term, session]);
    const g = grade(saved?.total || total);
    return ok(res, {
      ...saved,
      id:        saved?.id,
      studentId: studentId,
      subject:   subject,
      term, session,
      ca:        caVal,
      exam:      examVal,
      total:     saved?.total ?? total,
      gradeLabel:g.grade,
      remark:    g.remark,
    }, {}, 201);
  } catch (e) { return fail(res, 500, e.message); }
};

exports.bulkCreate = async (req, res) => {
  try {
    const { results: rows = [], class_id: cls, subject_id: subject, term_id: term, session_id: session } = req.body ?? {};
    if (!Array.isArray(rows) || !rows.length) return fail(res, 400, 'results[] required.');

    let saved = 0, skipped = 0;

    for (const r of rows) {
      const studentId  = r.student_id || r.studentId;
      const subjectName = subject || r.subject_id || r.subject;
      const termVal    = term    || r.term_id    || r.term;
      const sessionVal = session || r.session_id || r.session;
      if (!studentId || !subjectName || !termVal || !sessionVal) { skipped++; continue; }

      const student = await db.query1(`SELECT s.*, c.name AS class_name FROM students s
        LEFT JOIN classes c ON c.id=s.class_id WHERE s.id=?`, [studentId]);
      if (!student) { skipped++; continue; }

      const maxCA   = db.getMaxCA();
      const maxExam = db.getMaxExam();
      const caVal   = Math.min(maxCA,   Math.max(0, parseInt(r.ca)   || 0));
      const examVal = Math.min(maxExam, Math.max(0, parseInt(r.exam) || 0));
      const total   = caVal + examVal;
      const subj    = db.subjects.find(s => s.name === subjectName || s.code === subjectName);

      try {
        await db.run(
          `INSERT INTO results (student_id, class_id, arm, subject_id, subject_name, term, session, ca, exam, total)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE ca=VALUES(ca), exam=VALUES(exam), total=VALUES(total)`,
          [studentId, student.class_id, student.arm, subj?.id || null, subjectName, termVal, sessionVal, caVal, examVal, caVal + examVal]
        );
        saved++;
      } catch { skipped++; }
    }

    return ok(res, { saved, skipped, total: rows.length });
  } catch (e) { return fail(res, 500, e.message); }
};

exports.update = async (req, res) => {
  try {
    const { id } = req.params;
    const row = await db.query1('SELECT * FROM results WHERE id=?', [id]);
    if (!row) return fail(res, 404, 'Result not found.');

    const maxCA   = db.getMaxCA();
    const maxExam = db.getMaxExam();
    const caVal   = req.body.ca   != null ? Math.min(maxCA,   Math.max(0, parseInt(req.body.ca)))   : row.ca;
    const examVal = req.body.exam != null ? Math.min(maxExam, Math.max(0, parseInt(req.body.exam))) : row.exam;
    const total   = caVal + examVal;

    await db.run('UPDATE results SET ca=?, exam=?, total=? WHERE id=?', [caVal, examVal, caVal + examVal, id]);
    const updated = await db.query1('SELECT * FROM results WHERE id=?', [id]);
    const g = grade(updated?.total ?? caVal + examVal);
    return ok(res, { ...updated, studentId: updated?.student_id, subject: updated?.subject_name, gradeLabel: g.grade, remark: g.remark });
  } catch (e) { return fail(res, 500, e.message); }
};

exports.remove = async (req, res) => {
  try {
    const row = await db.query1('SELECT id FROM results WHERE id=?', [req.params.id]);
    if (!row) return fail(res, 404, 'Result not found.');
    await db.run('DELETE FROM results WHERE id=?', [req.params.id]);
    return ok(res, { id: Number(req.params.id), deleted: true });
  } catch (e) { return fail(res, 500, e.message); }
};

exports.getStats = async (req, res) => {
  try {
    const { class: cls, arm, term, session } = req.query;
    const clsRow = cls ? await db.query1('SELECT id FROM classes WHERE name=?', [cls]) : null;
    const classId = clsRow?.id || null;

    const [overall, bySubject] = await Promise.all([
      db.query1(
        `SELECT COUNT(*) AS total, ROUND(AVG(total),1) AS average, MAX(total) AS highest, MIN(total) AS lowest,
         SUM(total>=40) AS passing, SUM(total<40) AS failing,
         ROUND(SUM(total>=40)/NULLIF(COUNT(*),0)*100,1) AS pass_rate
         FROM results WHERE 1=1${classId?' AND class_id=?':''}${arm?' AND arm=?':''}${term?' AND term=?':''}${session?' AND session=?':''}`,
        [...(classId?[classId]:[]), ...(arm?[arm]:[]), ...(term?[term]:[]), ...(session?[session]:[])]
      ),
      db.query(
        `SELECT subject_name AS subject, ROUND(AVG(total),1) AS average, COUNT(*) AS count, MAX(total) AS highest, MIN(total) AS lowest
         FROM results WHERE 1=1${classId?' AND class_id=?':''}${arm?' AND arm=?':''}${term?' AND term=?':''}${session?' AND session=?':''}
         GROUP BY subject_name ORDER BY average DESC`,
        [...(classId?[classId]:[]), ...(arm?[arm]:[]), ...(term?[term]:[]), ...(session?[session]:[])]
      ),
    ]);

    return ok(res, { overall, bySubject });
  } catch (e) { return fail(res, 500, e.message); }
};

exports.getAllocations = async (req, res) => {
  try {
    const { class: cls, arm } = req.query;
    const clsRow = cls ? await db.query1('SELECT id FROM classes WHERE name=?', [cls]) : null;
    if (!clsRow) return ok(res, []);
    const rows = await db.query(
      'SELECT s.name, s.code, s.level, s.type FROM class_subject_allocations a JOIN subjects s ON s.id=a.subject_id WHERE a.class_id=?' + (arm ? ' AND a.arm=?' : ''),
      arm ? [clsRow.id, arm] : [clsRow.id]);
    return ok(res, rows);
  } catch (e) { return fail(res, 500, e.message); }
};

/* ── GET /api/results/:id ──────────────────────────────────────────────── */
exports.getOne = async (req, res) => {
  try {
    const row = await db.query1(`SELECT r.*, s.name AS student_name
      FROM results r JOIN students s ON s.id=r.student_id WHERE r.id=?`, [req.params.id]);
    if (!row) return fail(res, 404, 'Result not found.');
    const g = grade(row.total || 0);
    return ok(res, { ...row, studentId: row.student_id, subject: row.subject_name, gradeLabel: g.grade, remark: g.remark });
  } catch (e) { return fail(res, 500, e.message); }
};

/* ── GET /api/results/report-card/:studentId ───────────────────────────── */
exports.getReportCard = async (req, res) => {
  try {
    const { studentId } = req.params;
    const { term, session } = req.query;
    const rows = await db.query(
      'SELECT * FROM results WHERE student_id=? AND term=? AND session=? ORDER BY subject_name',
      [studentId, term, session]);
    const graded = rows.map(r => {
      const ca   = Number(r.ca   ?? 0);
      const exam = Number(r.exam ?? 0);
      const tot  = ca + exam;   // always recompute
      return { ...r, studentId: r.student_id, subject: r.subject_name,
               ca, exam, total: tot, subject_name: r.subject_name, ...grade(tot) };
    });
    const totalScore = graded.reduce((a, r) => a + r.total, 0);
    const avg = graded.length ? parseFloat((totalScore / graded.length).toFixed(1)) : 0;
    return ok(res, { studentId, term, session, results: graded, average: avg, totalScore });
  } catch (e) { return fail(res, 500, e.message); }
};

/* ── CLASS ALLOCATION ──────────────────────────────────────────────────── */
exports.getClassAllocation = async (req, res) => {
  try {
    const { class: cls, arm } = req.params;
    const clsRow = await db.query1('SELECT id FROM classes WHERE name=?', [cls]);
    if (!clsRow) return fail(res, 404, 'Class not found.');
    const rows = await db.query(
      `SELECT s.id, s.name, s.code, s.level, s.type
       FROM class_subject_allocations a JOIN subjects s ON s.id=a.subject_id
       WHERE a.class_id=? AND a.arm=? ORDER BY s.name`, [clsRow.id, arm]);
    // Return both the full objects AND a plain names array for easy use
    return ok(res, rows, {
      subjects: rows.map(s => s.name),  // ← plain string array
      count: rows.length,
    });
  } catch (e) { return fail(res, 500, e.message); }
};

exports.setClassAllocation = async (req, res) => {
  try {
    const { class: cls, arm } = req.params;
    const { subjects = [] } = req.body ?? {};
    const clsRow = await db.query1('SELECT id FROM classes WHERE name=?', [cls]);
    if (!clsRow) return fail(res, 404, 'Class not found.');

    // Accept both numeric IDs and subject names
    const resolvedIds = [];
    for (const sub of subjects) {
      if (typeof sub === 'number' || (typeof sub === 'string' && /^\d+$/.test(sub))) {
        resolvedIds.push(parseInt(sub));
      } else {
        // Look up by name
        const row = await db.query1('SELECT id FROM subjects WHERE name=? OR code=?', [sub, sub]);
        if (row) resolvedIds.push(row.id);
      }
    }

    await db.run('DELETE FROM class_subject_allocations WHERE class_id=? AND arm=?', [clsRow.id, arm]);
    for (const subjectId of resolvedIds) {
      await db.run('INSERT IGNORE INTO class_subject_allocations (class_id, arm, subject_id) VALUES (?, ?, ?)',
        [clsRow.id, arm, subjectId]);
    }

    // Return the saved subjects with names for confirmation
    const saved = await db.query(
      `SELECT s.id, s.name, s.code FROM class_subject_allocations a
       JOIN subjects s ON s.id=a.subject_id
       WHERE a.class_id=? AND a.arm=? ORDER BY s.name`,
      [clsRow.id, arm]);

    return ok(res, { class: cls, arm, subjects: saved.map(s=>s.name), count: saved.length, updated: true });
  } catch (e) { return fail(res, 500, e.message); }
};

exports.clearClassAllocation = async (req, res) => {
  try {
    const { class: cls, arm } = req.params;
    const clsRow = await db.query1('SELECT id FROM classes WHERE name=?', [cls]);
    if (!clsRow) return fail(res, 404, 'Class not found.');
    await db.run('DELETE FROM class_subject_allocations WHERE class_id=? AND arm=?', [clsRow.id, arm]);
    return ok(res, { class: cls, arm, cleared: true });
  } catch (e) { return fail(res, 500, e.message); }
};

/* ── STUDENT ALLOCATION ────────────────────────────────────────────────── */
exports.getStudentAllocation = async (req, res) => {
  try {
    const rows = await db.query(
      `SELECT s.id, s.name, s.code, s.level, s.type
       FROM student_subject_allocations a JOIN subjects s ON s.id=a.subject_id
       WHERE a.student_id=? ORDER BY s.name`, [req.params.studentId]);
    return ok(res, rows);
  } catch (e) { return fail(res, 500, e.message); }
};

exports.setStudentAllocation = async (req, res) => {
  try {
    const { studentId } = req.params;
    const { subjects = [] } = req.body ?? {};

    const student = await db.query1('SELECT id FROM students WHERE id=?', [studentId]);
    if (!student) return fail(res, 404, 'Student not found.');
    const maxSubj = db.getMaxStudentSubjects();
    if (subjects.length > maxSubj) return fail(res, 400, `Maximum ${maxSubj} subjects allowed.`);

    await db.run('DELETE FROM student_subject_allocations WHERE student_id=?', [studentId]);
    for (const subjectId of subjects) {
      await db.run('INSERT IGNORE INTO student_subject_allocations (student_id, subject_id) VALUES (?, ?)',
        [studentId, subjectId]);
    }
    return ok(res, { studentId, subjects, updated: true });
  } catch (e) { return fail(res, 500, e.message); }
};

exports.bulkSetStudentAllocations = async (req, res) => {
  try {
    const { class: cls, arm, subjects = [] } = req.body ?? {};
    if (!cls || !arm) return fail(res, 400, 'class and arm are required.');
    const maxSubj = db.getMaxStudentSubjects();
    if (subjects.length > maxSubj) return fail(res, 400, `Maximum ${maxSubj} subjects allowed.`);

    const clsRow = await db.query1('SELECT id FROM classes WHERE name=?', [cls]);
    if (!clsRow) return fail(res, 404, 'Class not found.');

    const students = await db.query('SELECT id FROM students WHERE class_id=? AND arm=? AND active=1', [clsRow.id, arm]);
    let updated = 0;

    for (const student of students) {
      await db.run('DELETE FROM student_subject_allocations WHERE student_id=?', [student.id]);
      for (const subjectId of subjects) {
        await db.run('INSERT IGNORE INTO student_subject_allocations (student_id, subject_id) VALUES (?, ?)',
          [student.id, subjectId]);
      }
      updated++;
    }

    return ok(res, { class: cls, arm, subjects, studentsUpdated: updated });
  } catch (e) { return fail(res, 500, e.message); }
};