'use strict';
const db = require('../config/db');
const fail = (res, s, m) => res.status(s).json({ success: false, message: m });
const ok   = (res, data, meta = {}, s = 200) => res.status(s).json({ success: true, ...meta, data });

const VALID_STATUS = ['p','l','a','e','present','late','absent','excused'];
function normalise(s) {
  return ({ present:'p', late:'l', absent:'a', excused:'e' })[s?.toLowerCase()] || s;
}

exports.getAll = async (req, res) => {
  try {
    const { studentId, class: cls, arm, date, term, session, status } = req.query;
    let sql = `SELECT a.*, s.name AS student_name, c.name AS class_name
               FROM attendance a JOIN students s ON s.id=a.student_id
               LEFT JOIN classes c ON c.id=a.class_id WHERE 1=1`;
    const p = [];
    if (studentId) { sql += ' AND a.student_id=?'; p.push(studentId); }
    if (cls)       { sql += ' AND c.name=?';        p.push(cls); }
    if (arm)       { sql += ' AND a.arm=?';         p.push(arm); }
    if (date)      { sql += ' AND a.date=?';        p.push(date); }
    if (term)      { sql += ' AND a.term=?';        p.push(term); }
    if (session)   { sql += ' AND a.session=?';     p.push(session); }
    if (status)    { sql += ' AND a.status=?';      p.push(normalise(status)); }
    sql += ' ORDER BY a.date DESC, s.name LIMIT 1000';
    const rows = await db.query(sql, p);
    return ok(res, rows, { count: rows.length });
  } catch (e) { return fail(res, 500, e.message); }
};

exports.mark = async (req, res) => {
  try {
    const { studentId, class: cls, arm, date, term, session, status, remarks } = req.body ?? {};
    if (!studentId || !date || !term || !session || !status)
      return fail(res, 400, 'studentId, date, term, session, status are required.');

    const st = normalise(status);
    if (!['p','l','a','e'].includes(st)) return fail(res, 400, `Invalid status "${status}".`);

    const student = await db.query1('SELECT id, class_id FROM students WHERE id=?', [studentId]);
    if (!student) return fail(res, 404, 'Student not found.');

    const clsRow = cls ? await db.query1('SELECT id FROM classes WHERE name=?', [cls]) : null;
    const classId = clsRow?.id || student.class_id;

    await db.run(
      `INSERT INTO attendance (student_id, class_id, arm, date, term, session, status, remarks)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE status=VALUES(status), remarks=VALUES(remarks)`,
      [studentId, classId, arm || null, date, term, session, st, remarks || null]
    );

    // Update student attendance percentage
    const [tot, pres] = await Promise.all([
      db.query1('SELECT COUNT(*) AS n FROM attendance WHERE student_id=? AND term=? AND session=?', [studentId, term, session]),
      db.query1("SELECT COUNT(*) AS n FROM attendance WHERE student_id=? AND term=? AND session=? AND status IN ('p','l')", [studentId, term, session]),
    ]);
    const pct = Number(tot?.n) > 0 ? parseFloat((Number(pres?.n) / Number(tot?.n) * 100).toFixed(1)) : 100;
    await db.run('UPDATE students SET attendance=? WHERE id=?', [pct, studentId]);
    const cached = db.findStudent(studentId);
    if (cached) cached.attendance = pct;

    const saved = await db.query1('SELECT * FROM attendance WHERE student_id=? AND date=? AND session=?', [studentId, date, session]);
    return ok(res, saved, {}, 201);
  } catch (e) { return fail(res, 500, e.message); }
};

exports.bulkMark = async (req, res) => {
  try {
    const { class: cls, arm, date, term, session, records = [] } = req.body ?? {};
    if (!date || !term || !session || !records.length)
      return fail(res, 400, 'date, term, session, and records[] are required.');

    const clsRow = cls ? await db.query1('SELECT id FROM classes WHERE name=?', [cls]) : null;
    let saved = 0, skipped = 0;

    for (const r of records) {
      const studentId = r.student_id || r.studentId;
      const st = normalise(r.status);
      if (!studentId || !['p','l','a','e'].includes(st)) { skipped++; continue; }

      const student = await db.query1('SELECT id, class_id FROM students WHERE id=?', [studentId]);
      if (!student) { skipped++; continue; }

      const classId = clsRow?.id || student.class_id;
      try {
        await db.run(
          `INSERT INTO attendance (student_id, class_id, arm, date, term, session, status, remarks)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE status=VALUES(status)`,
          [studentId, classId, arm || null, date, term, session, st, r.remarks || null]
        );
        saved++;
      } catch { skipped++; }
    }

    // Sync attendance % for all students in the batch
    const studentIds = [...new Set(records.map(r => r.student_id || r.studentId).filter(Boolean))];
    for (const sid of studentIds) {
      const [tot, pres] = await Promise.all([
        db.query1('SELECT COUNT(*) AS n FROM attendance WHERE student_id=? AND term=? AND session=?', [sid, term, session]),
        db.query1("SELECT COUNT(*) AS n FROM attendance WHERE student_id=? AND term=? AND session=? AND status IN ('p','l')", [sid, term, session]),
      ]);
      const pct = Number(tot?.n) > 0 ? parseFloat((Number(pres?.n) / Number(tot?.n) * 100).toFixed(1)) : 100;
      await db.run('UPDATE students SET attendance=? WHERE id=?', [pct, sid]);
      const cached = db.findStudent(sid);
      if (cached) cached.attendance = pct;
    }

    return ok(res, { saved, skipped, date, term, session });
  } catch (e) { return fail(res, 500, e.message); }
};

exports.update = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, remarks } = req.body ?? {};
    const row = await db.query1('SELECT * FROM attendance WHERE id=?', [id]);
    if (!row) return fail(res, 404, 'Attendance record not found.');

    const st = status ? normalise(status) : row.status;
    if (!['p','l','a','e'].includes(st)) return fail(res, 400, 'Invalid status.');

    await db.run('UPDATE attendance SET status=?, remarks=? WHERE id=?',
      [st, remarks ?? row.remarks, id]);
    return ok(res, { ...row, status: st, remarks: remarks ?? row.remarks });
  } catch (e) { return fail(res, 500, e.message); }
};

exports.remove = async (req, res) => {
  try {
    const row = await db.query1('SELECT id FROM attendance WHERE id=?', [req.params.id]);
    if (!row) return fail(res, 404, 'Attendance record not found.');
    await db.run('DELETE FROM attendance WHERE id=?', [req.params.id]);
    return ok(res, { id: Number(req.params.id), deleted: true });
  } catch (e) { return fail(res, 500, e.message); }
};

exports.getSummary = async (req, res) => {
  try {
    const { studentId } = req.params;
    const { term, session } = req.query;
    const rows = await db.query(
      'SELECT status, COUNT(*) AS n FROM attendance WHERE student_id=? AND term=? AND session=? GROUP BY status',
      [studentId, term, session]);
    const counts = { p: 0, l: 0, a: 0, e: 0 };
    rows.forEach(r => { counts[r.status] = Number(r.n); });
    const total   = counts.p + counts.a + counts.l;
    const present = counts.p + counts.l;
    const pct     = total > 0 ? parseFloat((present / total * 100).toFixed(1)) : 100;
    return ok(res, { studentId, term, session, ...counts, total, attendancePct: pct });
  } catch (e) { return fail(res, 500, e.message); }
};

exports.getClassSummary = async (req, res) => {
  try {
    const { class: cls, arm, term, session } = req.query;
    if (!cls || !term || !session) return fail(res, 400, 'class, term, session required.');
    const clsRow = await db.query1('SELECT id FROM classes WHERE name=?', [cls]);
    if (!clsRow) return fail(res, 404, 'Class not found.');

    const rows = await db.query(
      `SELECT s.id AS student_id, s.name,
        SUM(a.status='p') AS present, SUM(a.status='a') AS absent,
        SUM(a.status='l') AS late, SUM(a.status='e') AS excused,
        CASE WHEN SUM(a.status IN ('p','a','l'))=0 THEN 100
             ELSE ROUND(SUM(a.status='p')/SUM(a.status IN ('p','a','l'))*100)
        END AS attendance_pct
       FROM students s
       LEFT JOIN attendance a ON a.student_id=s.id AND a.class_id=? AND a.term=? AND a.session=?
       ${arm ? 'AND a.arm=?' : ''}
       WHERE s.class_id=? ${arm ? 'AND s.arm=?' : ''} AND s.active=1
       GROUP BY s.id, s.name ORDER BY s.name`,
      arm ? [clsRow.id, term, session, arm, clsRow.id, arm] : [clsRow.id, term, session, clsRow.id]
    );
    return ok(res, rows, { count: rows.length });
  } catch (e) { return fail(res, 500, e.message); }
};

exports.getClassDomains = async (req, res) => {
  try {
    const { class: cls, arm, term, session } = req.query;
    if (!term || !session) return fail(res, 400, 'term and session required.');
    const clsRow = cls ? await db.query1('SELECT id FROM classes WHERE name=?', [cls]) : null;

    let sql = 'SELECT d.*, s.name AS student_name FROM domain_assessments d JOIN students s ON s.id=d.student_id WHERE d.term=? AND d.session=?';
    const p = [term, session];
    if (clsRow) { sql += ' AND s.class_id=?'; p.push(clsRow.id); }
    if (arm)    { sql += ' AND s.arm=?';       p.push(arm); }
    sql += ' ORDER BY s.name';

    const rows = await db.query(sql, p);
    return ok(res, rows, { count: rows.length });
  } catch (e) { return fail(res, 500, e.message); }
};

exports.setStudentDomains = async (req, res) => {
  try {
    const { studentId } = req.params;
    const { term, session } = req.query;
    if (!term || !session) return fail(res, 400, 'term and session query params required.');

    const student = await db.query1('SELECT id FROM students WHERE id=?', [studentId]);
    if (!student) return fail(res, 404, 'Student not found.');

    const fields = ['cognitive','affective','psychomotor',
                    'behavior_0','behavior_1','behavior_2','behavior_3',
                    'behavior_4','behavior_5','behavior_6','behavior_7'];

    const values = fields.map(f => req.body[f] != null ? parseInt(req.body[f]) : null);

    await db.run(
      `INSERT INTO domain_assessments (student_id, term, session, ${fields.join(',')})
       VALUES (?, ?, ?, ${fields.map(() => '?').join(',')})
       ON DUPLICATE KEY UPDATE ${fields.map(f => `${f}=VALUES(${f})`).join(',')}`,
      [studentId, term, session, ...values]
    );

    const saved = await db.query1('SELECT * FROM domain_assessments WHERE student_id=? AND term=? AND session=?', [studentId, term, session]);
    return ok(res, saved);
  } catch (e) { return fail(res, 500, e.message); }
};

exports.getSchoolDays = async (req, res) => {
  try {
    const { term } = req.params;
    const settings = await db.getSettings();
    const start = settings[`att_termStart`] || settings.resumption_date;
    const end   = settings[`att_termEnd`];
    if (!start || !end) return ok(res, [], { message: 'Term dates not configured.' });

    const working = (settings.att_workingDays?.split(',') || ['Monday','Tuesday','Wednesday','Thursday','Friday']);
    const special = new Set(
      JSON.parse(settings.att_specialDays || '[]')
        .filter(d => d.type !== 'event').map(d => d.date)
    );

    const days = [];
    const cursor = new Date(start + 'T00:00');
    const endDate = new Date(end + 'T00:00');
    const DAY_NAMES = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

    while (cursor <= endDate) {
      const iso  = cursor.toISOString().substring(0, 10);
      const name = DAY_NAMES[cursor.getDay()];
      if (working.includes(name) && !special.has(iso)) days.push(iso);
      cursor.setDate(cursor.getDate() + 1);
    }

    return ok(res, days, { count: days.length, term });
  } catch (e) { return fail(res, 500, e.message); }
};

exports.exportAttendance = async (req, res) => {
  try {
    const { class: cls, arm, term, session } = req.query;
    const clsRow = cls ? await db.query1('SELECT id FROM classes WHERE name=?', [cls]) : null;

    let sql = `SELECT s.id, s.name, c.name AS class, s.arm,
               SUM(a.status='p') AS present, SUM(a.status='l') AS late,
               SUM(a.status='a') AS absent, SUM(a.status='e') AS excused,
               s.attendance AS pct
               FROM students s
               LEFT JOIN classes c ON c.id=s.class_id
               LEFT JOIN attendance a ON a.student_id=s.id AND a.term=? AND a.session=?
               WHERE s.active=1`;
    const p = [term, session];
    if (clsRow) { sql += ' AND s.class_id=?'; p.push(clsRow.id); }
    if (arm)    { sql += ' AND s.arm=?';       p.push(arm); }
    sql += ' GROUP BY s.id, s.name ORDER BY c.name, s.arm, s.name';

    const rows = await db.query(sql, p);
    const lines = ['ID,Name,Class,Arm,Present,Late,Absent,Excused,Attendance%'];
    rows.forEach(r => lines.push([r.id,r.name,r.class,r.arm,r.present,r.late,r.absent,r.excused,r.pct].join(',')));

    res.setHeader('Content-Type','text/csv');
    res.setHeader('Content-Disposition','attachment; filename="attendance.csv"');
    return res.send(lines.join('\n'));
  } catch (e) { return fail(res, 500, e.message); }
};