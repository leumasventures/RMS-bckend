'use strict';
const db = require('../config/db');
const fail = (res, s, m) => res.status(s).json({ success: false, message: m });
const ok   = (res, data, meta = {}, s = 200) => res.status(s).json({ success: true, ...meta, data });

function grade(score) {
  const g = db.gradeScore(score);
  return { grade: g.grade, remark: g.remark };
}

/* ── helper: returns "subject_name" or "subject" based on live DB column ── */
async function subjectCol() {
  if (db._subjectColName) return db._subjectColName;
  try {
    const cols = await db.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'results'
       AND COLUMN_NAME IN ('subject_name','subject')`
    );
    db._subjectColName = cols.find(c => c.COLUMN_NAME === 'subject_name')
      ? 'subject_name' : 'subject';
  } catch { db._subjectColName = 'subject_name'; }
  return db._subjectColName;
}

exports.getAll = async (req, res) => {
  try {
    const sc = await subjectCol();
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
    if (subject)   { sql += ` AND r.${sc}=?`;       p.push(subject); }
    sql += ` ORDER BY s.name, r.${sc}`;
    const rows = await db.query(sql, p);
    return ok(res, rows.map(r => {
      const ca   = Number(r.ca   ?? 0);
      const exam = Number(r.exam ?? 0);
      const tot  = ca + exam;
      const g    = grade(tot);
      return { ...r, studentId: r.student_id, subject: r[sc],
               ca, exam, total: tot, gradeLabel: g.grade, remark: g.remark };
    }), { count: rows.length });
  } catch (e) { return fail(res, 500, e.message); }
};

exports.create = async (req, res) => {
  try {
    const sc = await subjectCol();
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

    const subj    = db.subjects.find(s => s.name === subject || s.code === subject);
    const classId = student.class_id;

    await db.run(
      `INSERT INTO results (student_id, class_id, arm, subject_id, ${sc}, term, session, ca, exam)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE ca=VALUES(ca), exam=VALUES(exam)`,
      [studentId, classId, student.arm, subj?.id || null, subject, term, session, caVal, examVal]
    );

    const saved = await db.query1(
      `SELECT * FROM results WHERE student_id=? AND ${sc}=? AND term=? AND session=?`,
      [studentId, subject, term, session]);
    const total = Number(saved?.ca ?? caVal) + Number(saved?.exam ?? examVal);
    const g = grade(total);
    return ok(res, {
      ...saved,
      studentId, subject, term, session,
      ca:        caVal,
      exam:      examVal,
      total,
      gradeLabel:g.grade,
      remark:    g.remark,
    }, {}, 201);
  } catch (e) { return fail(res, 500, e.message); }
};

exports.bulkCreate = async (req, res) => {
  try {
    const sc = await subjectCol();
    const { results: rows = [], class_id: cls, subject_id: subject, term_id: term, session_id: session } = req.body ?? {};
    if (!Array.isArray(rows) || !rows.length) return fail(res, 400, 'results[] required.');

    let saved = 0, skipped = 0;

    for (const r of rows) {
      const studentId   = r.student_id || r.studentId;
      const subjectName = subject || r.subject_id || r.subject;
      const termVal     = term    || r.term_id    || r.term;
      const sessionVal  = session || r.session_id || r.session;
      if (!studentId || !subjectName || !termVal || !sessionVal) { skipped++; continue; }

      const student = await db.query1(`SELECT s.*, c.name AS class_name FROM students s
        LEFT JOIN classes c ON c.id=s.class_id WHERE s.id=?`, [studentId]);
      if (!student) { skipped++; continue; }

      const maxCA   = db.getMaxCA();
      const maxExam = db.getMaxExam();
      const caVal   = Math.min(maxCA,   Math.max(0, parseInt(r.ca)   || 0));
      const examVal = Math.min(maxExam, Math.max(0, parseInt(r.exam) || 0));
      const subj    = db.subjects.find(s => s.name === subjectName || s.code === subjectName);

      try {
        await db.run(
          `INSERT INTO results (student_id, class_id, arm, subject_id, ${sc}, term, session, ca, exam)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE ca=VALUES(ca), exam=VALUES(exam)`,
          [studentId, student.class_id, student.arm, subj?.id || null, subjectName, termVal, sessionVal, caVal, examVal]
        );
        saved++;
      } catch { skipped++; }
    }

    return ok(res, { saved, skipped, total: rows.length });
  } catch (e) { return fail(res, 500, e.message); }
};

exports.update = async (req, res) => {
  try {
    const sc = await subjectCol();
    const { id } = req.params;
    const row = await db.query1('SELECT * FROM results WHERE id=?', [id]);
    if (!row) return fail(res, 404, 'Result not found.');

    const maxCA   = db.getMaxCA();
    const maxExam = db.getMaxExam();
    const caVal   = req.body.ca   != null ? Math.min(maxCA,   Math.max(0, parseInt(req.body.ca)))   : row.ca;
    const examVal = req.body.exam != null ? Math.min(maxExam, Math.max(0, parseInt(req.body.exam))) : row.exam;

    await db.run('UPDATE results SET ca=?, exam=? WHERE id=?', [caVal, examVal, id]);
    const updated = await db.query1('SELECT * FROM results WHERE id=?', [id]);
    const g = grade((updated?.ca ?? caVal) + (updated?.exam ?? examVal));
    return ok(res, { ...updated, studentId: updated?.student_id, subject: updated?.[sc], gradeLabel: g.grade, remark: g.remark });
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
    const sc = await subjectCol();
    const { class: cls, arm, term, session } = req.query;
    const clsRow = cls ? await db.query1('SELECT id FROM classes WHERE name=?', [cls]) : null;
    const classId = clsRow?.id || null;

    const [overall, bySubject] = await Promise.all([
      db.query1(
        `SELECT COUNT(*) AS total, ROUND(AVG(ca+exam),1) AS average, MAX(ca+exam) AS highest, MIN(ca+exam) AS lowest,
         SUM((ca+exam)>=40) AS passing, SUM((ca+exam)<40) AS failing,
         ROUND(SUM((ca+exam)>=40)/NULLIF(COUNT(*),0)*100,1) AS pass_rate
         FROM results WHERE 1=1${classId?' AND class_id=?':''}${arm?' AND arm=?':''}${term?' AND term=?':''}${session?' AND session=?':''}`,
        [...(classId?[classId]:[]), ...(arm?[arm]:[]), ...(term?[term]:[]), ...(session?[session]:[])]
      ),
      db.query(
        `SELECT ${sc} AS subject, ROUND(AVG(ca+exam),1) AS average, COUNT(*) AS count, MAX(ca+exam) AS highest, MIN(ca+exam) AS lowest
         FROM results WHERE 1=1${classId?' AND class_id=?':''}${arm?' AND arm=?':''}${term?' AND term=?':''}${session?' AND session=?':''}
         GROUP BY ${sc} ORDER BY average DESC`,
        [...(classId?[classId]:[]), ...(arm?[arm]:[]), ...(term?[term]:[]), ...(session?[session]:[])]
      ),
    ]);

    return ok(res, { overall, bySubject });
  } catch (e) { return fail(res, 500, e.message); }
};

/* ── GET /api/results/:id ──────────────────────────────────────────────── */
exports.getOne = async (req, res) => {
  try {
    const sc = await subjectCol();
    const row = await db.query1(`SELECT r.*, s.name AS student_name
      FROM results r JOIN students s ON s.id=r.student_id WHERE r.id=?`, [req.params.id]);
    if (!row) return fail(res, 404, 'Result not found.');
    const total = Number(row.ca ?? 0) + Number(row.exam ?? 0);
    const g = grade(total);
    return ok(res, { ...row, studentId: row.student_id, subject: row[sc], total, gradeLabel: g.grade, remark: g.remark });
  } catch (e) { return fail(res, 500, e.message); }
};

/* ── GET /api/results/report-card/:studentId ───────────────────────────── */
exports.getReportCard = async (req, res) => {
  try {
    const sc = await subjectCol();
    const { studentId } = req.params;
    const { term, session } = req.query;
    const rows = await db.query(
      `SELECT * FROM results WHERE student_id=? AND term=? AND session=? ORDER BY ${sc}`,
      [studentId, term, session]);
    const graded = rows.map(r => {
      const ca   = Number(r.ca   ?? 0);
      const exam = Number(r.exam ?? 0);
      const tot  = ca + exam;
      return { ...r, studentId: r.student_id, subject: r[sc],
               ca, exam, total: tot, subject_name: r[sc], ...grade(tot) };
    });
    const totalScore = graded.reduce((a, r) => a + r.total, 0);
    const avg = graded.length ? parseFloat((totalScore / graded.length).toFixed(1)) : 0;
    return ok(res, { studentId, term, session, results: graded, average: avg, totalScore });
  } catch (e) { return fail(res, 500, e.message); }
};

/* ── CLASS ALLOCATION ──────────────────────────────────────────────────── */
exports.getClassAllocation = async (req, res) => {
  try {
    const cls = req.params.cls || req.params.class || req.query.class;
    const arm = req.params.arm || req.query.arm;
    if (!cls) return ok(res, [], { subjects: [], count: 0 });
    const clsRow = await db.query1('SELECT id FROM classes WHERE name=?', [cls]);
    if (!clsRow) return ok(res, [], { subjects: [], count: 0 });
    const rows = await db.query(
      `SELECT s.id, s.name, s.code, s.level, s.type
       FROM class_subject_allocations a JOIN subjects s ON s.id=a.subject_id
       WHERE a.class_id=?${arm ? ' AND a.arm=?' : ''} ORDER BY s.name`,
      arm ? [clsRow.id, arm] : [clsRow.id]);
    return ok(res, rows, { subjects: rows.map(s => s.name), count: rows.length });
  } catch (e) { return fail(res, 500, e.message); }
};

exports.setClassAllocation = async (req, res) => {
  try {
    const cls = req.params.cls || req.params.class || req.query.class || req.body.class;
    const arm = req.params.arm || req.query.arm || req.body.arm;
    const { subjects = [] } = req.body ?? {};
    const clsRow = await db.query1('SELECT id FROM classes WHERE name=?', [cls]);
    if (!clsRow) return fail(res, 404, 'Class not found.');

    const resolvedIds = [];
    for (const sub of subjects) {
      if (typeof sub === 'number' || (typeof sub === 'string' && /^\d+$/.test(sub))) {
        resolvedIds.push(parseInt(sub));
      } else {
        const row = await db.query1('SELECT id FROM subjects WHERE name=? OR code=?', [sub, sub]);
        if (row) resolvedIds.push(row.id);
      }
    }

    await db.run('DELETE FROM class_subject_allocations WHERE class_id=? AND arm=?', [clsRow.id, arm]);
    for (const subjectId of resolvedIds) {
      await db.run('INSERT IGNORE INTO class_subject_allocations (class_id, arm, subject_id) VALUES (?, ?, ?)',
        [clsRow.id, arm, subjectId]);
    }

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
    const cls = req.params.cls || req.params.class || req.query.class;
    const arm = req.params.arm || req.query.arm;
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
    const maxSubj = db.getMaxStudentSubjects ? db.getMaxStudentSubjects() : 9;
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
    const maxSubj = db.getMaxStudentSubjects ? db.getMaxStudentSubjects() : 9;
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

/* ══════════════════════════════════════════════════════════════════════
   UPSERT — single result save
   POST /api/results
   Body: { studentId, subject, term, session, ca, exam }
   NOTE: class is optional — looked up from student record if missing
══════════════════════════════════════════════════════════════════════ */
exports.upsert = async (req, res) => {
  try {
    const data      = req.body ?? {};
    const studentId = data.studentId || data.student_id;
    const subject   = data.subject;
    const term      = data.term;
    const session   = data.session;

    if (!studentId || !subject || !term || !session)
      return fail(res, 400, 'studentId, subject, term, session are required.');

    // Look up class from student record if not provided
    let cls = data.class || data.className || null;
    let arm = data.arm || null;
    if (!cls || !arm) {
      const student = await db.query1(
        `SELECT s.*, c.name AS class_name FROM students s
         LEFT JOIN classes c ON c.id=s.class_id WHERE s.id=?`, [studentId]);
      if (!student) return fail(res, 404, 'Student not found.');
      cls = cls || student.class_name || null;
      arm = arm || student.arm || null;
    }

    const record = await db.upsertResult({
      studentId, subject, term, session,
      class: cls, arm,
      ca:   data.ca   ?? 0,
      exam: data.exam ?? 0,
    });

    return res.status(200).json({ ok: true, data: record });
  } catch (e) {
    console.error('[upsert] Error:', e.message);
    return res.status(500).json({ ok: false, message: e.message });
  }
};

/* ══════════════════════════════════════════════════════════════════════
   BULK UPSERT — save many results at once
   POST /api/results/bulk
   Body: { results: [{ studentId|student_id, subject, term, session, ca, exam }] }
══════════════════════════════════════════════════════════════════════ */
exports.bulkUpsert = async (req, res) => {
  try {
    const { results, term: defTerm, session: defSession } = req.body ?? {};

    if (!Array.isArray(results) || !results.length)
      return res.status(400).json({ ok: false, message: 'results[] array is required.' });

    console.log(`[bulkUpsert] received ${results.length} items. First:`, JSON.stringify(results[0]));

    const maxCA   = db.getMaxCA();
    const maxExam = db.getMaxExam();
    const saved   = [];
    const errors  = [];

    for (const item of results) {
      try {
        const studentId = item.studentId || item.student_id;
        if (!studentId) { errors.push({ item, error: 'missing studentId' }); continue; }

        const subject = item.subject;
        const term    = item.term    || defTerm;
        const session = item.session || defSession;
        if (!subject || !term || !session) {
          errors.push({ item, error: 'missing subject, term or session' }); continue;
        }

        const caVal   = Math.min(maxCA,   Math.max(0, parseFloat(item.ca)   || 0));
        const examVal = Math.min(maxExam, Math.max(0, parseFloat(item.exam) || 0));

        // Look up class/arm from student if not in payload
        let cls = item.class || item.className || null;
        let arm = item.arm || null;
        if (!cls || !arm) {
          const student = await db.query1(
            `SELECT s.*, c.name AS class_name FROM students s
             LEFT JOIN classes c ON c.id=s.class_id WHERE s.id=?`, [studentId]);
          cls = cls || student?.class_name || null;
          arm = arm || student?.arm || null;
        }

        const record = await db.upsertResult({
          studentId, subject, term, session,
          class: cls, arm,
          ca:    caVal,
          exam:  examVal,
          total: caVal + examVal,
        });
        saved.push(record);
      } catch (e) {
        console.error(`[bulkUpsert] FAILED — sid:${item.studentId||item.student_id} subj:${item.subject} err:`, e.message);
        errors.push({ item, error: e.message });
      }
    }

    console.log(`[bulkUpsert] done: saved=${saved.length} errors=${errors.length}`);
    if (errors.length) console.error('[bulkUpsert] errors:', JSON.stringify(errors));

    return res.status(200).json({
      ok:      true,
      saved:   saved.length,
      skipped: errors.length,
      errors:  errors.length ? errors : undefined,
      data:    saved,
    });
  } catch (e) {
    console.error('[bulkUpsert] OUTER ERROR:', e.message, e.stack);
    return res.status(500).json({ ok: false, message: e.message });
  }
};

/* ══════════════════════════════════════════════════════════════════════
   DELEGATED EXPORTS — from checkResultController & reportCardController
══════════════════════════════════════════════════════════════════════ */
const check = require('./checkResultController');
const card  = require('./reportCardController');

exports.getStudentResults = check.getResultSheet;
exports.getClassResults   = card.classSummary;
exports.getClassSummary   = card.classSummary;
exports.exportResults     = (req, res) => res.status(501).json({ ok: false, message: 'exportResults not yet implemented.' });
exports.getRemarks        = (req, res) => card.getOne(req, res);
exports.saveRemarks       = card.saveRemark;
exports.getDomains        = card.getDomains;
exports.saveDomains       = card.setDomains;