'use strict';
/**
 * controllers/resultController.js — Sacred Heart College
 *
 * FIXES:
 *  1. bulkCreate — accepts BOTH old field names (student_id, subject_id, term_id, session_id)
 *     AND new camelCase names (studentId, subjectName, term, session) sent by teacher portal.
 *  2. getClassAllocation — reads class & arm from req.query (not req.params) so the
 *     GET /api/results/class-allocation?class=JSS1&arm=A route works correctly.
 *  3. subject lookup in create/bulkCreate — falls back to a live DB query when
 *     db.subjects in-memory cache is empty (avoids saving NULL subject_id).
 */

const db   = require('../config/db');
const fail = (res, s, m) => res.status(s).json({ success: false, message: m });
const ok   = (res, data, meta = {}, s = 200) => res.status(s).json({ success: true, ...meta, data });

function grade(score) {
  const g = db.gradeScore(score);
  return { grade: g.grade, remark: g.remark };
}

/* ── Subject ID lookup (DB fallback when in-memory cache is cold) ── */
async function resolveSubjectId(name) {
  if (!name) return null;
  // Try in-memory cache first (fast)
  const cached = (db.subjects || []).find(s => s.name === name || s.code === name);
  if (cached) return cached.id;
  // Fall back to DB query
  const row = await db.query1('SELECT id FROM subjects WHERE name=? OR code=? LIMIT 1', [name, name]);
  return row?.id || null;
}

/* ════════════════════════════════════════════════════════════════
   GET /api/results
════════════════════════════════════════════════════════════════ */
exports.getAll = async (req, res) => {
  try {
    const { studentId, class: cls, arm, term, session, subject } = req.query;
    let sql = `SELECT r.*, s.name AS student_name, c.name AS class_name
               FROM results r
               JOIN students s ON s.id = r.student_id
               LEFT JOIN classes c ON c.id = r.class_id
               WHERE 1=1`;
    const p = [];
    if (studentId) { sql += ' AND r.student_id=?';   p.push(studentId); }
    if (cls)       { sql += ' AND c.name=?';          p.push(cls); }
    if (arm)       { sql += ' AND r.arm=?';           p.push(arm); }
    if (term)      { sql += ' AND r.term=?';          p.push(term); }
    if (session)   { sql += ' AND r.session=?';       p.push(session); }
    if (subject)   { sql += ' AND r.subject_name=?';  p.push(subject); }
    sql += ' ORDER BY s.name, r.subject_name';

    const rows = await db.query(sql, p);
    return ok(res, rows.map(r => {
      const ca   = Number(r.ca   ?? 0);
      const exam = Number(r.exam ?? 0);
      const tot  = ca + exam;
      const g    = grade(tot);
      return { ...r, studentId: r.student_id, subject: r.subject_name,
               ca, exam, total: tot, gradeLabel: g.grade, remark: g.remark };
    }), { count: rows.length });
  } catch (e) { return fail(res, 500, e.message); }
};

/* ════════════════════════════════════════════════════════════════
   POST /api/results  (single)
════════════════════════════════════════════════════════════════ */
exports.create = async (req, res) => {
  try {
    // Accept both naming conventions
    const studentId  = req.body.studentId  || req.body.student_id;
    const subjectName= req.body.subjectName|| req.body.subject_name || req.body.subject;
    const term       = req.body.term       || req.body.term_id;
    const session    = req.body.session    || req.body.session_id;
    const caRaw      = req.body.ca;
    const examRaw    = req.body.exam;

    if (!studentId || !subjectName || !term || !session)
      return fail(res, 400, 'studentId, subjectName, term, session are required.');

    const student = await db.query1(
      `SELECT s.*, c.name AS class_name FROM students s
       LEFT JOIN classes c ON c.id = s.class_id WHERE s.id=?`,
      [studentId]
    );
    if (!student) return fail(res, 404, 'Student not found.');

    const maxCA   = db.getMaxCA();
    const maxExam = db.getMaxExam();
    const caVal   = Math.min(maxCA,   Math.max(0, parseInt(caRaw)   || 0));
    const examVal = Math.min(maxExam, Math.max(0, parseInt(examRaw) || 0));
    const total   = caVal + examVal;

    // FIX: always resolve subject_id from DB, don't rely on cold cache
    const subjectId = await resolveSubjectId(subjectName);

    await db.run(
      `INSERT INTO results (student_id, class_id, arm, subject_id, subject_name, term, session, ca, exam)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE ca=VALUES(ca), exam=VALUES(exam)`,
      [studentId, student.class_id, student.arm, subjectId, subjectName,
       term, session, caVal, examVal]
    );

    const saved = await db.query1(
      'SELECT * FROM results WHERE student_id=? AND subject_name=? AND term=? AND session=?',
      [studentId, subjectName, term, session]
    );
    const g = grade(saved?.total ?? total);
    return ok(res, {
      ...saved,
      studentId, subject: subjectName, term, session,
      ca: caVal, exam: examVal, total: saved?.total ?? total,
      gradeLabel: g.grade, remark: g.remark,
    }, {}, 201);
  } catch (e) { return fail(res, 500, e.message); }
};

/* ════════════════════════════════════════════════════════════════
   POST /api/results/bulk
   FIX: accepts BOTH old API field names AND teacher-portal field names
════════════════════════════════════════════════════════════════ */
exports.bulkCreate = async (req, res) => {
  try {
    // Support both { results: [...] } and { rows: [...] } and plain array body
    const body = req.body ?? {};

    // Top-level defaults (old API style: class_id, subject_id, term_id, session_id)
    const defaultSubject = body.subject_id  || body.subjectName || body.subject    || null;
    const defaultTerm    = body.term_id     || body.term                           || null;
    const defaultSession = body.session_id  || body.session                        || null;

    const rows = Array.isArray(body)
      ? body
      : Array.isArray(body.results) ? body.results
      : Array.isArray(body.rows)    ? body.rows
      : [];

    if (!rows.length) return fail(res, 400, 'results[] required.');

    let saved = 0, skipped = 0;

    for (const r of rows) {
      // FIX: accept camelCase (teacher portal) AND snake_case (old API)
      const studentId   = r.studentId   || r.student_id;
      const subjectName = r.subjectName || r.subject_name || r.subject || defaultSubject;
      const term        = r.term        || r.term_id      || defaultTerm;
      const session     = r.session     || r.session_id   || defaultSession;

      if (!studentId || !subjectName || !term || !session) { skipped++; continue; }

      const student = await db.query1(
        `SELECT s.*, c.name AS class_name FROM students s
         LEFT JOIN classes c ON c.id = s.class_id WHERE s.id=?`,
        [studentId]
      );
      if (!student) { skipped++; continue; }

      const maxCA   = db.getMaxCA();
      const maxExam = db.getMaxExam();
      const caVal   = Math.min(maxCA,   Math.max(0, parseInt(r.ca)   || 0));
      const examVal = Math.min(maxExam, Math.max(0, parseInt(r.exam) || 0));

      // FIX: always resolve subject_id from DB
      const subjectId = await resolveSubjectId(subjectName);

      try {
        await db.run(
          `INSERT INTO results (student_id, class_id, arm, subject_id, subject_name, term, session, ca, exam)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE ca=VALUES(ca), exam=VALUES(exam)`,
          [studentId, student.class_id, student.arm,
           subjectId, subjectName, term, session, caVal, examVal]
        );
        saved++;
      } catch (e2) {
        console.error('[bulkCreate] row error:', e2.message, { studentId, subjectName });
        skipped++;
      }
    }

    return ok(res, { saved, skipped, total: rows.length });
  } catch (e) { return fail(res, 500, e.message); }
};

/* ════════════════════════════════════════════════════════════════
   PUT /api/results/:id
════════════════════════════════════════════════════════════════ */
exports.update = async (req, res) => {
  try {
    const row = await db.query1('SELECT * FROM results WHERE id=?', [req.params.id]);
    if (!row) return fail(res, 404, 'Result not found.');

    const maxCA   = db.getMaxCA();
    const maxExam = db.getMaxExam();
    const caVal   = req.body.ca   != null ? Math.min(maxCA,   Math.max(0, parseInt(req.body.ca)))   : row.ca;
    const examVal = req.body.exam != null ? Math.min(maxExam, Math.max(0, parseInt(req.body.exam))) : row.exam;

    await db.run('UPDATE results SET ca=?, exam=? WHERE id=?', [caVal, examVal, req.params.id]);
    const updated = await db.query1('SELECT * FROM results WHERE id=?', [req.params.id]);
    const g = grade((updated?.total) ?? caVal + examVal);
    return ok(res, {
      ...updated, studentId: updated?.student_id, subject: updated?.subject_name,
      gradeLabel: g.grade, remark: g.remark,
    });
  } catch (e) { return fail(res, 500, e.message); }
};

/* ════════════════════════════════════════════════════════════════
   DELETE /api/results/:id
════════════════════════════════════════════════════════════════ */
exports.remove = async (req, res) => {
  try {
    const row = await db.query1('SELECT id FROM results WHERE id=?', [req.params.id]);
    if (!row) return fail(res, 404, 'Result not found.');
    await db.run('DELETE FROM results WHERE id=?', [req.params.id]);
    return ok(res, { id: Number(req.params.id), deleted: true });
  } catch (e) { return fail(res, 500, e.message); }
};

/* ════════════════════════════════════════════════════════════════
   GET /api/results/stats
════════════════════════════════════════════════════════════════ */
exports.getStats = async (req, res) => {
  try {
    const { class: cls, arm, term, session } = req.query;
    const clsRow  = cls ? await db.query1('SELECT id FROM classes WHERE name=?', [cls]) : null;
    const classId = clsRow?.id || null;
    const p = [...(classId ? [classId] : []), ...(arm ? [arm] : []),
               ...(term ? [term] : []), ...(session ? [session] : [])];
    const where = (classId ? ' AND class_id=?' : '') +
                  (arm     ? ' AND arm=?'      : '') +
                  (term    ? ' AND term=?'     : '') +
                  (session ? ' AND session=?'  : '');

    const [overall, bySubject] = await Promise.all([
      db.query1(`SELECT COUNT(*) AS total, ROUND(AVG(total),1) AS average,
                 MAX(total) AS highest, MIN(total) AS lowest,
                 SUM(total>=40) AS passing, SUM(total<40) AS failing,
                 ROUND(SUM(total>=40)/NULLIF(COUNT(*),0)*100,1) AS pass_rate
                 FROM results WHERE 1=1${where}`, p),
      db.query(`SELECT subject_name AS subject, ROUND(AVG(total),1) AS average,
                COUNT(*) AS count, MAX(total) AS highest, MIN(total) AS lowest
                FROM results WHERE 1=1${where}
                GROUP BY subject_name ORDER BY average DESC`, p),
    ]);
    return ok(res, { overall, bySubject });
  } catch (e) { return fail(res, 500, e.message); }
};

/* ════════════════════════════════════════════════════════════════
   GET /api/results/allocations  (flat list — used by dropdowns)
════════════════════════════════════════════════════════════════ */
exports.getAllocations = async (req, res) => {
  try {
    const { class: cls, arm } = req.query;
    const clsRow = cls ? await db.query1('SELECT id FROM classes WHERE name=?', [cls]) : null;
    if (!clsRow) return ok(res, []);
    const rows = await db.query(
      'SELECT s.name, s.code, s.level, s.type FROM class_subject_allocations a ' +
      'JOIN subjects s ON s.id=a.subject_id WHERE a.class_id=?' + (arm ? ' AND a.arm=?' : ''),
      arm ? [clsRow.id, arm] : [clsRow.id]
    );
    return ok(res, rows);
  } catch (e) { return fail(res, 500, e.message); }
};

/* ════════════════════════════════════════════════════════════════
   GET /api/results/:id
════════════════════════════════════════════════════════════════ */
exports.getOne = async (req, res) => {
  try {
    const row = await db.query1(
      `SELECT r.*, s.name AS student_name FROM results r
       JOIN students s ON s.id=r.student_id WHERE r.id=?`,
      [req.params.id]
    );
    if (!row) return fail(res, 404, 'Result not found.');
    const g = grade(row.total || 0);
    return ok(res, { ...row, studentId: row.student_id, subject: row.subject_name,
                     gradeLabel: g.grade, remark: g.remark });
  } catch (e) { return fail(res, 500, e.message); }
};

/* ════════════════════════════════════════════════════════════════
   GET /api/results/report-card/:studentId
════════════════════════════════════════════════════════════════ */
exports.getReportCard = async (req, res) => {
  try {
    const { studentId } = req.params;
    const { term, session } = req.query;
    const rows = await db.query(
      'SELECT * FROM results WHERE student_id=? AND term=? AND session=? ORDER BY subject_name',
      [studentId, term, session]
    );
    const graded = rows.map(r => {
      const ca   = Number(r.ca   ?? 0);
      const exam = Number(r.exam ?? 0);
      const tot  = ca + exam;
      return { ...r, studentId: r.student_id, subject: r.subject_name,
               ca, exam, total: tot, subject_name: r.subject_name, ...grade(tot) };
    });
    const avg = graded.length
      ? parseFloat((graded.reduce((a, r) => a + r.total, 0) / graded.length).toFixed(1))
      : 0;
    return ok(res, { studentId, term, session, results: graded, average: avg });
  } catch (e) { return fail(res, 500, e.message); }
};

/* ════════════════════════════════════════════════════════════════
   CLASS ALLOCATION
   FIX: reads class & arm from req.QUERY (not req.params) so
        GET /api/results/class-allocation?class=JSS1&arm=A works.
════════════════════════════════════════════════════════════════ */
exports.getClassAllocation = async (req, res) => {
  try {
    // Support both ?class=X&arm=Y (query) and /:class/:arm (params) forms
    const cls = req.query.class || req.params.class;
    const arm = req.query.arm   || req.params.arm;
    if (!cls) return ok(res, [], { subjects: [], count: 0 });

    const clsRow = await db.query1('SELECT id FROM classes WHERE name=?', [cls]);
    if (!clsRow) return ok(res, [], { subjects: [], count: 0 });

    const rows = await db.query(
      `SELECT s.id, s.name, s.code, s.level, s.type
       FROM class_subject_allocations a
       JOIN subjects s ON s.id = a.subject_id
       WHERE a.class_id=?${arm ? ' AND a.arm=?' : ''}
       ORDER BY s.name`,
      arm ? [clsRow.id, arm] : [clsRow.id]
    );
    return ok(res, rows, { subjects: rows.map(s => s.name), count: rows.length });
  } catch (e) { return fail(res, 500, e.message); }
};

exports.setClassAllocation = async (req, res) => {
  try {
    const cls = req.query.class || req.params.class || req.body.class;
    const arm = req.query.arm   || req.params.arm   || req.body.arm;
    const { subjects = [] } = req.body ?? {};
    if (!cls) return fail(res, 400, 'class is required.');

    const clsRow = await db.query1('SELECT id FROM classes WHERE name=?', [cls]);
    if (!clsRow) return fail(res, 404, 'Class not found.');

    // Accept both IDs and names
    const resolvedIds = [];
    for (const sub of subjects) {
      if (typeof sub === 'number' || (typeof sub === 'string' && /^\d+$/.test(sub))) {
        resolvedIds.push(parseInt(sub));
      } else {
        const row = await db.query1('SELECT id FROM subjects WHERE name=? OR code=?', [sub, sub]);
        if (row) resolvedIds.push(row.id);
      }
    }

    await db.run('DELETE FROM class_subject_allocations WHERE class_id=?' + (arm ? ' AND arm=?' : ''),
      arm ? [clsRow.id, arm] : [clsRow.id]);

    for (const subjectId of resolvedIds) {
      await db.run(
        'INSERT IGNORE INTO class_subject_allocations (class_id, arm, subject_id) VALUES (?, ?, ?)',
        [clsRow.id, arm || '', subjectId]
      );
    }

    const saved = await db.query(
      `SELECT s.id, s.name, s.code FROM class_subject_allocations a
       JOIN subjects s ON s.id = a.subject_id
       WHERE a.class_id=?${arm ? ' AND a.arm=?' : ''} ORDER BY s.name`,
      arm ? [clsRow.id, arm] : [clsRow.id]
    );
    return ok(res, { class: cls, arm, subjects: saved.map(s => s.name), count: saved.length, updated: true });
  } catch (e) { return fail(res, 500, e.message); }
};

exports.clearClassAllocation = async (req, res) => {
  try {
    const cls = req.query.class || req.params.class;
    const arm = req.query.arm   || req.params.arm;
    const clsRow = await db.query1('SELECT id FROM classes WHERE name=?', [cls]);
    if (!clsRow) return fail(res, 404, 'Class not found.');
    await db.run('DELETE FROM class_subject_allocations WHERE class_id=?' + (arm ? ' AND arm=?' : ''),
      arm ? [clsRow.id, arm] : [clsRow.id]);
    return ok(res, { class: cls, arm, cleared: true });
  } catch (e) { return fail(res, 500, e.message); }
};

/* ════════════════════════════════════════════════════════════════
   STUDENT ALLOCATION
════════════════════════════════════════════════════════════════ */
exports.getStudentAllocation = async (req, res) => {
  try {
    const rows = await db.query(
      `SELECT s.id, s.name, s.code, s.level, s.type
       FROM student_subject_allocations a
       JOIN subjects s ON s.id = a.subject_id
       WHERE a.student_id=? ORDER BY s.name`,
      [req.params.studentId]
    );
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
      await db.run(
        'INSERT IGNORE INTO student_subject_allocations (student_id, subject_id) VALUES (?, ?)',
        [studentId, subjectId]
      );
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
    const students = await db.query(
      'SELECT id FROM students WHERE class_id=? AND arm=? AND active=1',
      [clsRow.id, arm]
    );
    let updated = 0;
    for (const student of students) {
      await db.run('DELETE FROM student_subject_allocations WHERE student_id=?', [student.id]);
      for (const subjectId of subjects) {
        await db.run(
          'INSERT IGNORE INTO student_subject_allocations (student_id, subject_id) VALUES (?, ?)',
          [student.id, subjectId]
        );
      }
      updated++;
    }
    return ok(res, { class: cls, arm, subjects, studentsUpdated: updated });
  } catch (e) { return fail(res, 500, e.message); }
};