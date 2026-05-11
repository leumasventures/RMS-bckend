'use strict';

/**
 * config/db.js — Sacred Heart College (SAHARCO)
 * ──────────────────────────────────────────────
 * MySQL-backed drop-in for the original in-memory db object.
 *
 * SETUP
 *   1. npm install mysql2 dotenv
 *   2. Fill in DB_* values in your .env
 *   3. Run schema.sql once on your Hostinger DB
 *   4. Place this file at  config/db.js
 *   5. In server.js, inside app.listen() callback: await db.sync()
 *
 * HOW IT WORKS
 *   • db.sync()  — called once at boot; loads classes / students /
 *                  staff / subjects / settings into in-memory arrays
 *                  so all the synchronous controller code still works.
 *   • Every write helper (createStudent, upsertResult, updateSettings…)
 *     writes to MySQL AND updates the in-memory array simultaneously.
 *   • db.pool    — exposed for controllers that need raw async queries.
 *   • db.users   — loaded at boot; used by auth.js for JWT validation.
 */

const mysql = require('mysql2/promise');

/* ─── connection pool ────────────────────────────────────────── */

const pool = mysql.createPool({
  host:               process.env.DB_HOST     || 'auth-db1777.hstgr.io',
  port:               parseInt(process.env.DB_PORT || '3306', 10),
  user:               process.env.DB_USER     || 'u156099858_schaba',
  password:           process.env.DB_PASS     || process.env.DB_PASSWORD || 'SAHARCO1957abadiocese',
  database:           process.env.DB_NAME     || 'u156099858_schaba_db',
  waitForConnections: true,
  connectionLimit:    parseInt(process.env.DB_POOL_MAX || '10', 10),
  queueLimit:         0,
  decimalNumbers:     true,
  dateStrings:        true,
  timezone:           '+00:00',
});

// TEMP: remove after confirming connection works
console.log('[db] connecting with:', {
  host:     process.env.DB_HOST,
  user:     process.env.DB_USER,
  database: process.env.DB_NAME,
  password: process.env.DB_PASS ? '****' : 'MISSING',
});

/* ─── internal query helpers ─────────────────────────────────── */

async function q(sql, params = []) {
  const [rows] = await pool.query(sql, params);
  return rows;
}

async function q1(sql, params = []) {
  const rows = await q(sql, params);
  return rows[0] ?? null;
}

async function run(sql, params = []) {
  const [result] = await pool.query(sql, params);
  return result;  // { insertId, affectedRows, changedRows, … }
}

/* ─── id generator ───────────────────────────────────────────── */

let _idSeq = Date.now();
function nextId() { return ++_idSeq; }

/* ═══════════════════════════════════════════════════════════════
   DB OBJECT  —  same surface as the old in-memory store
═══════════════════════════════════════════════════════════════ */

const db = {

  /* raw pool + helpers */
  pool,
  query:  q,
  query1: q1,
  run,
  nextId,

  /* in-memory caches — populated by db.sync() */
  classes:           [],
  students:          [],
  staff:             [],
  teachers:          [],   // Academic + Leadership staff (alias)
  subjects:          [],
  users:             [],   // portal user accounts — used by auth.js
  results:           [],
  attendance:        [],
  admissions:        [],
  fees:              [],
  feeStructure:      [],
  reForms:           [],
  accessTokens:      {},   // { [code]: tokenRecord }
  studentTokenIndex: {},   // { [studentId]: [code, …] }
  parentTokens:      [],
  domainAssessments: [],
  remarks:           [],
  subjectAllocations:{},
  schoolInfo:        {},
  _settings:         {},

  /* ── BOOT SYNC ───────────────────────────────────────────────
     Call once inside app.listen() callback:
       app.listen(PORT, async () => { await db.sync(); });
  ─────────────────────────────────────────────────────────── */
  async sync() {
    const [
      classRows, armRows, studentRows, staffRows,
      subjectRows, feeStructRows, settingsRows, userRows,
    ] = await Promise.all([
      q('SELECT * FROM classes ORDER BY name'),
      q('SELECT * FROM class_arms'),
      q(`SELECT s.*, c.name AS class_name
         FROM students s
         LEFT JOIN classes c ON c.id = s.class_id
         ORDER BY s.name`),
      q(`SELECT st.*, c.name AS class_name
         FROM staff st
         LEFT JOIN classes c ON c.id = st.class_id
         ORDER BY st.name`),
      q('SELECT * FROM subjects ORDER BY name'),
      q('SELECT * FROM fee_structure ORDER BY id'),
      q('SELECT setting_key, setting_value FROM school_settings'),
      q('SELECT id, staff_id, student_id, name, email, role, assigned_class, assigned_arm, ward_id, active FROM users'),
    ]);

    /* classes with arms[] */
    const armsByClass = {};
    armRows.forEach(r => {
      (armsByClass[r.class_id] = armsByClass[r.class_id] || []).push(r.arm);
    });
    db.classes = classRows.map(c => ({
      id:    c.id,
      name:  c.name,
      level: c.level,
      arms:  armsByClass[c.id] || [],
    }));

    /* students */
    db.students = studentRows.map(s => ({
      id:         s.id,
      name:       s.name,
      class:      s.class_name || '',
      arm:        s.arm        || '',
      gender:     s.gender     || 'Male',
      dob:        s.dob        || '',
      parent:     s.parent     || '',
      phone:      s.phone      || '',
      address:    s.address    || '',
      attendance: parseFloat(s.attendance) || 100,
      active:     s.active === 1 || s.active === true,
      status:     s.status || 'active',
    }));

    /* staff */
    db.staff = staffRows.map(s => ({
      id:            s.id,
      name:          s.name,
      email:         s.email        || '',
      gender:        s.gender       || '',
      phone:         s.phone        || '',
      dateJoined:    s.date_joined  || '',
      status:        s.status       || 'Active',
      category:      s.category     || '',
      position:      s.position     || '',
      department:    s.department   || '',
      subject:       s.subject      || '',
      classUnit:     s.class_name   || '',
      class:         s.class_name   || '',
      assignedClass: s.class_name   || '',
      arm:           s.arm          || '',
      assignedArm:   s.arm          || '',
      qualification: s.qualification || '',
      experience:    s.experience   || '',
      notes:         s.notes        || '',
      credentials:   [],
      role:          'Staff',
    }));
    db.teachers = db.staff.filter(s =>
      ['Academic', 'Leadership'].includes(s.category)
    );

    /* subjects */
    db.subjects = subjectRows.map(s => ({
      id:    s.id,
      name:  s.name,
      code:  s.code,
      level: s.level,
      type:  s.type,
    }));

    /* fee structure */
    db.feeStructure = feeStructRows.map(f => ({
      id:     f.id,
      label:  f.label,
      amount: parseFloat(f.amount),
      level:  f.level,
    }));

    /* settings → flat map + schoolInfo */
    const settings = {};
    settingsRows.forEach(r => { settings[r.setting_key] = r.setting_value; });
    db._settings = settings;

    db.schoolInfo = {
      name:            settings.school_name      || process.env.SCHOOL_NAME    || 'Sacred Heart College',
      session:         settings.current_session  || process.env.CURRENT_SESSION|| '2025/2026',
      current_session: settings.current_session  || process.env.CURRENT_SESSION|| '2025/2026',
      term:            settings.current_term     || process.env.CURRENT_TERM   || 'First Term',
      current_term:    settings.current_term     || process.env.CURRENT_TERM   || 'First Term',
      principal:       settings.principal_name   || process.env.PRINCIPAL      || '',
      address:         settings.school_address   || '',
      phone:           settings.school_phone     || '',
      email:           settings.school_email     || '',
      logo:            settings.school_logo      || '',
      motto:           settings.school_motto     || '',
      website:         settings.school_website   || '',
      resumptionDate:  settings.resumption_date  || '',
      announcements:   settings.announcements    || '',
    };

    /* parse JSON blobs stored in settings */
    try { if (settings.parent_tokens)       db.parentTokens       = JSON.parse(settings.parent_tokens);       } catch {}
    try { if (settings.access_tokens)       db.accessTokens       = JSON.parse(settings.access_tokens);       } catch {}
    try { if (settings.student_token_index) db.studentTokenIndex  = JSON.parse(settings.student_token_index); } catch {}
    try { if (settings.subject_allocations) db.subjectAllocations = JSON.parse(settings.subject_allocations); } catch {}

    /* users — auth.js uses this to find user by id / email */
    db.users = userRows.map(u => ({
      id:            u.id,
      staffId:       u.staff_id    || null,
      studentId:     u.student_id  || null,
      name:          u.name,
      email:         u.email,
      role:          u.role,
      assignedClass: u.assigned_class || null,
      assignedArm:   u.assigned_arm   || null,
      wardId:        u.ward_id        || null,
      active:        u.active === 1 || u.active === true,
    }));

    /* these are loaded on-demand — start empty */
    db.results           = [];
    db.attendance        = [];
    db.admissions        = [];
    db.fees              = [];
    db.reForms           = [];
    db.domainAssessments = [];
    db.remarks           = [];

    console.info(
      `[db] synced — ${db.classes.length} classes, ` +
      `${db.students.length} students, ${db.staff.length} staff, ` +
      `${db.users.length} users`
    );
  },

  /* ── CLASS HELPERS ───────────────────────────────────────── */

  findClass(nameOrId) {
    if (!nameOrId) return null;
    return db.classes.find(c =>
      c.name === nameOrId ||
      c.id   === nameOrId ||
      c.id   === Number(nameOrId)
    ) || null;
  },

  classArmExists(className, arm) {
    const cls = db.findClass(className);
    return !!(cls && Array.isArray(cls.arms) && cls.arms.includes(arm));
  },

  /* ── STUDENT HELPERS ─────────────────────────────────────── */

  findStudent(id) {
    if (!id) return null;
    return db.students.find(s => s.id === id) || null;
  },

  studentsInClass(className, arm) {
    return db.students.filter(s =>
      s.class === className &&
      (!arm || s.arm === arm) &&
      s.active !== false
    );
  },

  async createStudent(data) {
    const cls = db.findClass(data.class);
    if (!cls) throw new Error(`Class "${data.class}" not found.`);

    await run(
      `INSERT INTO students
         (id, name, class_id, arm, gender, dob, parent, phone, address, attendance, active, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'active')`,
      [
        data.id, data.name, cls.id, data.arm,
        data.gender || 'Male',
        data.dob    || null,
        data.parent || '',
        data.phone  || '',
        data.address || '',
        data.attendance ?? 100,
      ]
    );

    const student = {
      id:         data.id,
      name:       data.name,
      class:      data.class,
      arm:        data.arm,
      gender:     data.gender  || 'Male',
      dob:        data.dob     || '',
      parent:     data.parent  || '',
      phone:      data.phone   || '',
      address:    data.address || '',
      attendance: data.attendance ?? 100,
      active:     true,
      status:     'active',
    };
    db.students.push(student);
    return student;
  },

  async updateAttendance(studentId, pct) {
    await run('UPDATE students SET attendance = ? WHERE id = ?', [pct, studentId]);
    const s = db.findStudent(studentId);
    if (s) s.attendance = pct;
    return s;
  },

  /* ── USER HELPERS (for auth.js) ──────────────────────────── */

  findUserById(id) {
    return db.users.find(u => u.id === Number(id)) || null;
  },

  findUserByEmail(email) {
    if (!email) return null;
    return db.users.find(u =>
      u.email.toLowerCase() === email.toLowerCase().trim()
    ) || null;
  },

  /**
   * getUserWithPassword(email) — returns full user row including
   * password_hash; used only by the login endpoint.
   */
  async getUserWithPassword(email) {
    return q1(
      'SELECT * FROM users WHERE email = ? AND active = 1 LIMIT 1',
      [email.toLowerCase().trim()]
    );
  },

  /**
   * getUserById(id) — full user row from DB (fresh, not cached).
   * auth.js calls this to verify the token subject still exists.
   */
  async getUserById(id) {
    return q1(
      `SELECT u.id, u.staff_id, u.student_id, u.name, u.email,
              u.role, u.assigned_class, u.assigned_arm, u.ward_id, u.active
       FROM users u
       WHERE u.id = ? AND u.active = 1 LIMIT 1`,
      [id]
    );
  },

  /* ── RESULT HELPERS ──────────────────────────────────────── */

  async findResult(studentId, subjectName, term, session) {
    return q1(
      'SELECT * FROM results WHERE student_id=? AND subject_name=? AND term=? AND session=?',
      [studentId, subjectName, term, session]
    );
  },

  async countSubjectsForStudent(studentId, term, session) {
    const row = await q1(
      `SELECT COUNT(DISTINCT subject_name) AS cnt
       FROM results WHERE student_id=? AND term=? AND session=?`,
      [studentId, term, session]
    );
    return Number(row?.cnt) || 0;
  },

  async upsertResult(data) {
    const cls    = db.findClass(data.class);
    const classId = cls?.id ?? null;
    const subj   = db.subjects.find(s => s.name === data.subject);
    const subjId  = subj?.id ?? null;

    await run(
      `INSERT INTO results
         (student_id, class_id, arm, subject_id, subject_name, term, session, ca, exam, total)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         ca=VALUES(ca), exam=VALUES(exam), total=VALUES(total)`,
      [
        data.studentId, classId, data.arm, subjId, data.subject,
        data.term, data.session, data.ca, data.exam, data.total,
      ]
    );

    const saved = await q1(
      'SELECT * FROM results WHERE student_id=? AND subject_name=? AND term=? AND session=?',
      [data.studentId, data.subject, data.term, data.session]
    );

    const record = {
      id:        saved?.id ?? nextId(),
      studentId: data.studentId,
      class:     data.class,
      arm:       data.arm,
      subject:   data.subject,
      term:      data.term,
      session:   data.session,
      ca:        data.ca,
      exam:      data.exam,
      total:     data.total,
    };

    const idx = db.results.findIndex(r =>
      r.studentId === data.studentId &&
      r.subject   === data.subject   &&
      r.term      === data.term      &&
      r.session   === data.session
    );
    if (idx >= 0) db.results[idx] = record; else db.results.push(record);

    return record;
  },

  resultsForStudent(studentId, term, session) {
    return db.results.filter(r =>
      r.studentId === studentId &&
      r.term      === term      &&
      r.session   === session
    );
  },

  studentTermSummary(studentId, term, session) {
    const rows = db.resultsForStudent(studentId, term, session);
    if (!rows.length) return null;
    const total   = rows.reduce((a, r) => a + (r.total || 0), 0);
    const average = parseFloat((total / rows.length).toFixed(1));
    return { subjectCount: rows.length, totalScore: total, average };
  },

  /* ── SETTINGS HELPERS ────────────────────────────────────── */

  async updateSettings(kvMap) {
    if (!kvMap || typeof kvMap !== 'object') return;
    const entries = Object.entries(kvMap).filter(([, v]) => v !== undefined);
    if (!entries.length) return;

    for (const [key, value] of entries) {
      const strVal = typeof value === 'object'
        ? JSON.stringify(value)
        : String(value ?? '');

      await run(
        `INSERT INTO school_settings (setting_key, setting_value) VALUES (?, ?)
         ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
        [key, strVal]
      );

      db._settings[key] = strVal;

      /* keep schoolInfo in sync */
      const infoMap = {
        school_name:     'name',    school_address:  'address',
        school_email:    'email',   school_phone:    'phone',
        school_motto:    'motto',   school_website:  'website',
        school_logo:     'logo',    current_session: 'session',
        current_term:    'term',    principal_name:  'principal',
        resumption_date: 'resumptionDate', announcements: 'announcements',
      };
      if (infoMap[key]) {
        db.schoolInfo[infoMap[key]] = strVal;
        if (key === 'current_session') db.schoolInfo.current_session = strVal;
        if (key === 'current_term')    db.schoolInfo.current_term    = strVal;
      }

      /* parse well-known JSON blobs into in-memory stores */
      try {
        if (key === 'parent_tokens')       db.parentTokens       = JSON.parse(strVal);
        if (key === 'access_tokens')       db.accessTokens       = JSON.parse(strVal);
        if (key === 'student_token_index') db.studentTokenIndex  = JSON.parse(strVal);
        if (key === 'subject_allocations') db.subjectAllocations = JSON.parse(strVal);
      } catch {}
    }
  },

  async getSettings() {
    const rows = await q('SELECT setting_key, setting_value FROM school_settings');
    const out  = {};
    rows.forEach(r => { out[r.setting_key] = r.setting_value; });
    db._settings = out;
    return out;
  },

  /* ── RE-FORM HELPERS ─────────────────────────────────────── */

  findReForm(id) {
    return db.reForms.find(f => f.id === Number(id)) || null;
  },

  getReFormsByStudent(studentId) {
    return db.reForms.filter(f => f.studentId === studentId);
  },
};

module.exports = db;