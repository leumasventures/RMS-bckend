'use strict';

/**
 * config/db.js — Sacred Heart College (SAHARCO)
 * ─────────────────────────────────────────────
 * Drop-in replacement for the in-memory db object.
 *
 * Every controller does:
 *   const db = require('../config/db');
 *   db.students, db.findStudent(), db.upsertResult(), etc.
 *
 * This module exposes the SAME surface as the in-memory store
 * but backed by MySQL via mysql2/promise connection pool.
 *
 * Quick-start:
 *   1. npm install mysql2
 *   2. Set env vars (or .env via dotenv):
 *        DB_HOST  DB_PORT  DB_USER  DB_PASS  DB_NAME
 *   3. Run schema.sql once to create the tables.
 *   4. Replace your old config/db.js with this file.
 *
 * ── Design ──────────────────────────────────────────────────────
 * Controllers were written against a simple in-memory object:
 *   db.students.push(...)
 *   db.students.filter(...)
 *   db.findStudent(id)
 *   db.upsertResult({...})
 *   etc.
 *
 * Rewriting every controller to be async-aware would be a large
 * refactor. Instead this module:
 *   • Exposes a `pool` for controllers that are already async-aware.
 *   • Exposes a synchronous-looking `db` object whose arrays are
 *     loaded at startup and kept in sync after each mutation.
 *   • Provides named helper methods (findStudent, upsertResult, …)
 *     that hit MySQL directly.
 *
 * Call `await db.sync()` once at server start (in app.js / server.js)
 * to load all reference data into the in-memory arrays.  After that,
 * every mutation helper also updates the in-memory array so the
 * controller code that does `db.students.push(...)` keeps working.
 */

require('dotenv').config();
const mysql = require('mysql2/promise');

/* ─── connection pool ────────────────────────────────────────────── */

const pool = mysql.createPool({
  host:            process.env.DB_HOST     || 'localhost',
  port:            parseInt(process.env.DB_PORT || '3306', 10),
  user:            process.env.DB_USER     || 'root',
  password:        process.env.DB_PASS     || '',
  database:        process.env.DB_NAME     || 'u156099858_shcaba_db',
  waitForConnections: true,
  connectionLimit:    10,
  queueLimit:         0,
  decimalNumbers:     true,
  dateStrings:        true,          // keep DATE columns as 'YYYY-MM-DD' strings
  charset:            'utf8mb4',
});

/* ─── tiny query helpers ─────────────────────────────────────────── */

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
  return result;   // { insertId, affectedRows, … }
}

/* ─── sequential id counter (mirrors in-memory nextId) ──────────── */

let _idCounter = Date.now();
function nextId() {
  return ++_idCounter;
}

/* ═══════════════════════════════════════════════════════════════════
   THE DB OBJECT
   Controllers import this and use it like the old in-memory store.
═══════════════════════════════════════════════════════════════════ */

const db = {

  // ── raw pool (for controllers that want direct SQL) ─────────────
  pool,
  query: q,

  // ── auto-incremented id (used by controllers that call db.nextId()) ─
  nextId,

  // ── in-memory caches (populated by db.sync()) ───────────────────
  classes:           [],
  students:          [],
  staff:             [],
  teachers:          [],   // alias — Academic/Leadership staff
  subjects:          [],
  results:           [],
  attendance:        [],
  admissions:        [],
  fees:              [],
  feeStructure:      [],
  reForms:           [],
  accessTokens:      {},   // { [code]: tokenRecord }
  studentTokenIndex: {},   // { [studentId]: [code,...] }
  parentTokens:      [],   // simple flat array used by api-bridge
  domainAssessments: [],
  remarks:           [],
  schoolInfo:        {},

  // ── sync: load everything from MySQL into the in-memory caches ──
  async sync() {
    const [
      classRows, armRows, studentRows, staffRows, subjectRows,
      feeStructRows, settingsRows,
    ] = await Promise.all([
      q('SELECT * FROM classes'),
      q('SELECT * FROM class_arms'),
      q('SELECT s.*, c.name AS class_name FROM students s LEFT JOIN classes c ON c.id = s.class_id'),
      q('SELECT st.*, c.name AS class_name FROM staff st LEFT JOIN classes c ON c.id = st.class_id'),
      q('SELECT * FROM subjects'),
      q('SELECT * FROM fee_structure'),
      q('SELECT setting_key, setting_value FROM school_settings'),
    ]);

    // Build classes with arms array
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

    // Students — map class_id → class name, arm stays as stored
    db.students = studentRows.map(s => ({
      id:         s.id,
      name:       s.name,
      class:      s.class_name || '',
      arm:        s.arm || '',
      gender:     s.gender,
      dob:        s.dob || '',
      parent:     s.parent || '',
      phone:      s.phone || '',
      address:    s.address || '',
      attendance: parseFloat(s.attendance) || 100,
      active:     !!s.active,
      status:     s.status || 'active',
    }));

    // Staff
    db.staff = staffRows.map(s => ({
      id:            s.id,
      name:          s.name,
      email:         s.email || '',
      gender:        s.gender || '',
      phone:         s.phone || '',
      dateJoined:    s.date_joined || '',
      status:        s.status || 'Active',
      category:      s.category,
      position:      s.position,
      department:    s.department || '',
      subject:       s.subject || '',
      classUnit:     s.class_name || '',
      class:         s.class_name || '',
      assignedClass: s.class_name || '',
      arm:           s.arm || '',
      assignedArm:   s.arm || '',
      qualification: s.qualification || '',
      experience:    s.experience || '',
      notes:         s.notes || '',
      credentials:   [],   // loaded on demand via staffController.getOne
      role:          'Staff',
    }));
    db.teachers = db.staff.filter(s =>
      ['Academic', 'Leadership'].includes(s.category)
    );

    db.subjects     = subjectRows;
    db.feeStructure = feeStructRows;

    // School settings → flat object + schoolInfo
    const settings = {};
    settingsRows.forEach(r => { settings[r.setting_key] = r.setting_value; });
    db._settings = settings;
    db.schoolInfo = {
      name:           settings.school_name     || 'Sacred Heart College',
      session:        settings.current_session || '2025/2026',
      term:           settings.current_term    || 'First Term',
      principal:      settings.principal_name  || '',
      address:        settings.school_address  || '',
      phone:          settings.school_phone    || '',
      email:          settings.school_email    || '',
      logo:           settings.school_logo     || '',
      motto:          settings.school_motto    || '',
      website:        settings.school_website  || '',
      resumptionDate: settings.resumption_date || '',
      announcements:  settings.announcements   || '',
      current_session: settings.current_session || '2025/2026',
    };

    // Parse JSON blobs stored in settings
    try { if (settings.parent_tokens) db.parentTokens = JSON.parse(settings.parent_tokens); } catch {}
    try {
      if (settings.access_tokens) {
        db.accessTokens      = JSON.parse(settings.access_tokens);
        db.studentTokenIndex = JSON.parse(settings.student_token_index || '{}');
      }
    } catch {}

    // Results, attendance, etc. are NOT pre-loaded (too large).
    // Controllers query the DB directly via the helper methods below.
    db.results           = [];
    db.attendance        = [];
    db.admissions        = [];
    db.fees              = [];
    db.reForms           = [];
    db.domainAssessments = [];
    db.remarks           = [];

    console.info(`[db] synced — ${db.classes.length} classes, ${db.students.length} students, ${db.staff.length} staff`);
  },

  /* ── CLASS HELPERS ─────────────────────────────────────────────── */

  findClass(nameOrId) {
    if (!nameOrId) return null;
    return db.classes.find(c =>
      c.name === nameOrId || c.id === nameOrId || c.id === Number(nameOrId)
    ) || null;
  },

  classArmExists(className, arm) {
    const cls = db.findClass(className);
    return !!(cls && cls.arms && cls.arms.includes(arm));
  },

  /* ── STUDENT HELPERS ───────────────────────────────────────────── */

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

  /**
   * Create a student in MySQL and push to the in-memory cache.
   * Returns the new student object.
   */
  async createStudent(data) {
    const cls = db.findClass(data.class);
    if (!cls) throw new Error(`Class "${data.class}" not found.`);

    await run(
      `INSERT INTO students
         (id, name, class_id, arm, gender, dob, parent, phone, address, attendance, active, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'active')`,
      [data.id, data.name, cls.id, data.arm, data.gender || 'Male',
       data.dob || null, data.parent || '', data.phone || '', data.address || '',
       data.attendance ?? 100]
    );

    const student = {
      id:         data.id,
      name:       data.name,
      class:      data.class,
      arm:        data.arm,
      gender:     data.gender || 'Male',
      dob:        data.dob    || '',
      parent:     data.parent || '',
      phone:      data.phone  || '',
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

  /* ── RESULT HELPERS ────────────────────────────────────────────── */

  /**
   * findResult(studentId, subjectName, term, session) → result row | null
   */
  async findResult(studentId, subjectName, term, session) {
    return q1(
      'SELECT * FROM results WHERE student_id=? AND subject_name=? AND term=? AND session=?',
      [studentId, subjectName, term, session]
    );
  },

  /**
   * countSubjectsForStudent(studentId, term, session) → number
   */
  async countSubjectsForStudent(studentId, term, session) {
    const row = await q1(
      'SELECT COUNT(DISTINCT subject_name) AS cnt FROM results WHERE student_id=? AND term=? AND session=?',
      [studentId, term, session]
    );
    return row?.cnt ?? 0;
  },

  /**
   * upsertResult({studentId, class, arm, subject, term, session, ca, exam, total})
   * Inserts or updates a result row and syncs the in-memory cache.
   */
  async upsertResult(data) {
    const cls     = db.findClass(data.class);
    const classId = cls?.id ?? null;

    // Look up subject id
    const subj   = db.subjects.find(s => s.name === data.subject);
    const subjId  = subj?.id ?? null;

    await run(
      `INSERT INTO results
         (student_id, class_id, arm, subject_id, subject_name, term, session, ca, exam, total)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         ca=VALUES(ca), exam=VALUES(exam), total=VALUES(total)`,
      [data.studentId, classId, data.arm, subjId, data.subject,
       data.term, data.session, data.ca, data.exam, data.total]
    );

    // Fetch the saved row to get id
    const saved = await q1(
      'SELECT * FROM results WHERE student_id=? AND subject_name=? AND term=? AND session=?',
      [data.studentId, data.subject, data.term, data.session]
    );

    // Sync in-memory cache
    const record = { ...data, id: saved?.id ?? nextId() };
    const idx = db.results.findIndex(r =>
      r.studentId === data.studentId && r.subject === data.subject &&
      r.term === data.term && r.session === data.session
    );
    if (idx >= 0) db.results[idx] = record; else db.results.push(record);

    return record;
  },

  /* ── SETTINGS HELPERS ──────────────────────────────────────────── */

  /**
   * updateSettings({ key: value, ... })
   * Upserts each key into school_settings.
   * Also accepts JSON blobs for access_tokens, parent_tokens, etc.
   */
  async updateSettings(kvMap) {
    if (!kvMap || typeof kvMap !== 'object') return;

    const entries = Object.entries(kvMap).filter(([, v]) => v !== undefined);
    if (!entries.length) return;

    // Batch upsert
    for (const [key, value] of entries) {
      const strVal = (typeof value === 'object') ? JSON.stringify(value) : String(value ?? '');
      await run(
        `INSERT INTO school_settings (setting_key, setting_value)
         VALUES (?, ?)
         ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
        [key, strVal]
      );

      // Keep in-memory setting in sync
      if (!db._settings) db._settings = {};
      db._settings[key] = strVal;

      // Hydrate schoolInfo from well-known keys
      const map = {
        school_name:      'name',
        school_address:   'address',
        school_email:     'email',
        school_phone:     'phone',
        school_motto:     'motto',
        school_website:   'website',
        school_logo:      'logo',
        current_session:  'session',
        current_term:     'term',
        principal_name:   'principal',
        resumption_date:  'resumptionDate',
        announcements:    'announcements',
      };
      if (map[key]) db.schoolInfo[map[key]] = strVal;

      // Persist access tokens / parent tokens to in-memory
      try {
        if (key === 'parent_tokens')        db.parentTokens      = JSON.parse(strVal);
        if (key === 'access_tokens')        db.accessTokens      = JSON.parse(strVal);
        if (key === 'student_token_index')  db.studentTokenIndex = JSON.parse(strVal);
      } catch {}
    }
  },

  /**
   * getSettings() — returns the flat key→value settings object.
   */
  async getSettings() {
    const rows = await q('SELECT setting_key, setting_value FROM school_settings');
    const out  = {};
    rows.forEach(r => { out[r.setting_key] = r.setting_value; });
    db._settings = out;
    return out;
  },

  /* ── RE-FORM HELPERS ───────────────────────────────────────────── */

  findReForm(id) {
    return db.reForms.find(f => f.id === Number(id)) || null;
  },

  getReFormsByStudent(studentId) {
    return db.reForms.filter(f => f.studentId === studentId);
  },

  /* ── RESULT SUMMARY HELPERS ────────────────────────────────────── */

  resultsForStudent(studentId, term, session) {
    return db.results.filter(r =>
      r.studentId === studentId && r.term === term && r.session === session
    );
  },

  studentTermSummary(studentId, term, session) {
    const rows = db.resultsForStudent(studentId, term, session);
    if (!rows.length) return null;
    const total   = rows.reduce((a, r) => a + (r.total || 0), 0);
    const average = parseFloat((total / rows.length).toFixed(1));
    return { subjectCount: rows.length, totalScore: total, average };
  },
};

module.exports = db;