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
  user:               process.env.DB_USER     || 'u156099858_shcaba',
  password:           process.env.DB_PASS     || process.env.DB_PASSWORD || 'SAHARCO1957abadiocese',
  database:           process.env.DB_NAME     || 'u156099858_shcaba_db',
  waitForConnections: true,
  connectionLimit:    parseInt(process.env.DB_POOL_MAX || '10', 10),
  queueLimit:         0,
  decimalNumbers:     true,
  dateStrings:        true,
  timezone:           '+00:00',
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
    // Ensure critical tables exist (created by migrate.js but may be missing on first deploy)

    await q(`CREATE TABLE IF NOT EXISTS admissions (
      id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      application_no      VARCHAR(30),
      first_name          VARCHAR(60)  NOT NULL,
      last_name           VARCHAR(60)  NOT NULL,
      middle_name         VARCHAR(60),
      gender              VARCHAR(10),
      dob                 DATE,
      blood_group         VARCHAR(5),
      genotype            VARCHAR(5),
      state_origin        VARCHAR(60),
      lga                 VARCHAR(60),
      address             TEXT,
      class_apply         VARCHAR(60),
      preferred_arm       VARCHAR(10),
      acad_session        VARCHAR(20),
      entry_term          VARCHAR(30),
      prev_school         VARCHAR(120),
      last_class          VARCHAR(60),
      guardian_name       VARCHAR(120),
      guardian_phone      VARCHAR(20),
      guardian_email      VARCHAR(160),
      guardian_addr       TEXT,
      relation            VARCHAR(40),
      assigned_class      VARCHAR(60),
      assigned_arm        VARCHAR(10),
      assigned_student_id VARCHAR(40),
      admitted_at         DATE,
      status              ENUM('Draft','Pending','Approved','Enrolled','Rejected') DEFAULT 'Pending',
      notes               TEXT,
      created_at          DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at          DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`).catch(e => console.warn('[db] admissions table:', e.message));

    // Add missing columns to existing table — MySQL 5.7-compatible (no IF NOT EXISTS)
    // Each runs only if the column is absent; errors are suppressed safely.
    const _existingCols = await q(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'admissions'`
    ).catch(() => []);
    const _colNames = new Set(_existingCols.map(r => r.COLUMN_NAME));
    const _colsToAdd = [
      { name: 'application_no',      sql: 'ALTER TABLE admissions ADD COLUMN application_no VARCHAR(30) AFTER id' },
      { name: 'assigned_class',      sql: 'ALTER TABLE admissions ADD COLUMN assigned_class VARCHAR(60) AFTER relation' },
      { name: 'assigned_arm',        sql: 'ALTER TABLE admissions ADD COLUMN assigned_arm VARCHAR(10) AFTER assigned_class' },
      { name: 'assigned_student_id', sql: 'ALTER TABLE admissions ADD COLUMN assigned_student_id VARCHAR(40) AFTER assigned_arm' },
      { name: 'admitted_at',         sql: 'ALTER TABLE admissions ADD COLUMN admitted_at DATE AFTER assigned_student_id' },
    ];
    for (const col of _colsToAdd) {
      if (!_colNames.has(col.name)) {
        await q(col.sql).catch(e => console.warn(`[db] add column ${col.name}:`, e.message));
      }
    }

    await q(`CREATE TABLE IF NOT EXISTS signup_requests (
      id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      type         ENUM('staff','parent','student') NOT NULL DEFAULT 'parent',
      name         VARCHAR(120) NOT NULL,
      email        VARCHAR(160) NOT NULL,
      phone        VARCHAR(20)  DEFAULT NULL,
      role_detail  VARCHAR(80)  DEFAULT NULL,
      student_id   VARCHAR(30)  DEFAULT NULL,
      raw_data     JSON         DEFAULT NULL,
      status       ENUM('pending','approved','rejected') DEFAULT 'pending',
      reviewed_by  VARCHAR(120) DEFAULT NULL,
      review_note  TEXT         DEFAULT NULL,
      created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at   DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`).catch(() => {});

    await q(`CREATE TABLE IF NOT EXISTS fixtures (
      id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      type       VARCHAR(50)  NOT NULL DEFAULT 'Football',
      team_a     VARCHAR(100) NOT NULL,
      team_b     VARCHAR(100) NOT NULL,
      date       DATE         NULL,
      time       VARCHAR(20)  NULL,
      venue      VARCHAR(200) NULL,
      status     VARCHAR(30)  NOT NULL DEFAULT 'Upcoming',
      score_a    TINYINT UNSIGNED NULL,
      score_b    TINYINT UNSIGNED NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`).catch(() => {});

    /* ── Ensure results table exists with correct schema ───────────────── */
    await q(`CREATE TABLE IF NOT EXISTS results (
      id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      student_id   VARCHAR(30)  NOT NULL,
      class_id     INT UNSIGNED DEFAULT NULL,
      arm          VARCHAR(10),
      subject_id   INT UNSIGNED DEFAULT NULL,
      subject_name VARCHAR(80)  NOT NULL DEFAULT '',
      term         VARCHAR(30)  NOT NULL,
      session      VARCHAR(20)  NOT NULL,
      ca           TINYINT UNSIGNED DEFAULT 0,
      exam         TINYINT UNSIGNED DEFAULT 0,
      total        TINYINT UNSIGNED DEFAULT 0,
      created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at   DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY   uniq_result (student_id, subject_name, term, session)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`).catch(() => {});

    /* ── Migrate old schema: fix column names if needed ─────────────────── */
    try {
      const resCols = await q(
        `SELECT COLUMN_NAME, EXTRA FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'results'`
      );
      const colMap = {};
      resCols.forEach(c => { colMap[c.COLUMN_NAME] = (c.EXTRA || '').toLowerCase(); });

      // Step 1: drop index FIRST (required before renaming columns in the index)
      if (colMap['subject'] !== undefined && colMap['subject_name'] === undefined) {
        await q(`ALTER TABLE results DROP INDEX uniq_result`).catch(() => {});
        // Rename subject → subject_name
        await q(`ALTER TABLE results CHANGE COLUMN \`subject\` subject_name VARCHAR(80) NOT NULL DEFAULT ''`)
          .catch(e => console.warn('[db] rename subject→subject_name:', e.message));
        // Recreate index
        await q(`ALTER TABLE results ADD UNIQUE KEY uniq_result (student_id, subject_name, term, session)`)
          .catch(e => console.warn('[db] recreate uniq_result:', e.message));
        console.log('[db] Migrated results.subject → subject_name');
        colMap['subject_name'] = '';
        delete colMap['subject'];
      }

      // Step 2: add class_id if missing (old schema had class_name)
      if (colMap['class_id'] === undefined) {
        await q(`ALTER TABLE results ADD COLUMN class_id INT UNSIGNED DEFAULT NULL AFTER student_id`)
          .catch(e => console.warn('[db] add class_id:', e.message));
      }
      if (colMap['class_name'] !== undefined) {
        await q(`ALTER TABLE results DROP COLUMN class_name`)
          .catch(e => console.warn('[db] drop class_name:', e.message));
      }

      // Step 3: add subject_id if missing
      if (colMap['subject_id'] === undefined) {
        await q(`ALTER TABLE results ADD COLUMN subject_id INT UNSIGNED DEFAULT NULL`)
          .catch(e => console.warn('[db] add subject_id:', e.message));
      }

      // Step 4: if total is GENERATED ALWAYS, change to regular column so both schemas work
      const totalExtra = colMap['total'] || '';
      if (totalExtra.includes('generated') || totalExtra.includes('virtual') || totalExtra.includes('stored')) {
        await q(`ALTER TABLE results MODIFY COLUMN total TINYINT UNSIGNED DEFAULT 0`)
          .catch(e => console.warn('[db] convert total from GENERATED to regular:', e.message));
        console.log('[db] Converted total from GENERATED ALWAYS to regular column');
      }

      // Step 5: add total column if missing entirely
      if (colMap['total'] === undefined) {
        await q(`ALTER TABLE results ADD COLUMN total TINYINT UNSIGNED DEFAULT 0`)
          .catch(e => console.warn('[db] add total column:', e.message));
      }

    } catch (e) { console.warn('[db] results migration error:', e.message); }

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

    /* ── Migrate old score_breakdown to CA:40 + Exam:60 if it has the old 3-component format ── */
    try {
      const rawBk = db._settings?.score_breakdown;
      if (rawBk) {
        const bk = JSON.parse(rawBk);
        // Old default had 3 keys: 'CA 1', 'CA 2', 'Exam' with values 10,10,80
        const keys = Object.keys(bk);
        const isOldDefault = keys.length === 3 &&
          keys.some(k => /ca\s*1/i.test(k)) &&
          keys.some(k => /ca\s*2/i.test(k));
        if (isOldDefault) {
          const newBk = JSON.stringify({ 'CA': 40, 'Exam': 60 });
          await run(
            `INSERT INTO school_settings (setting_key, setting_value) VALUES ('score_breakdown', ?)
             ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
            [newBk]
          );
          db._settings.score_breakdown = newBk;
          console.log('[db] Migrated score_breakdown from CA1+CA2+Exam(10+10+80) → CA+Exam(40+60)');
        }
      }
    } catch (e) { console.warn('[db] score_breakdown migration skipped:', e.message); }

    /* these are loaded on-demand — start empty */
    db.results           = [];
    db.attendance        = [];
    db.admissions        = [];
    db.fees              = [];
    db.reForms           = [];

    /* Load remarks and domain assessments from DB at startup */
    try {
      const currentTerm    = db._settings?.current_term    || '';
      const currentSession = db._settings?.current_session || '';
      const [remarkRows, domainRows, resultRows] = await Promise.all([
        q('SELECT * FROM report_card_remarks'),
        q('SELECT * FROM domain_assessments'),
        currentTerm && currentSession
          ? q('SELECT r.*, s.name AS student_name, c.name AS class_name FROM results r JOIN students s ON s.id=r.student_id LEFT JOIN classes c ON c.id=r.class_id WHERE r.term=? AND r.session=?', [currentTerm, currentSession])
          : Promise.resolve([]),
      ]);
      db.remarks = remarkRows.map(r => ({
        studentId:       r.student_id,
        term:            r.term,
        session:         r.session,
        teacherRemark:   r.teacher_remark   || '',
        principalRemark: r.principal_remark || '',
      }));
      db.domainAssessments = domainRows.map(d => ({
        studentId:   d.student_id,
        term:        d.term,
        session:     d.session,
        cognitive:   d.cognitive   ?? null,
        affective:   d.affective   ?? null,
        psychomotor: d.psychomotor ?? null,
        behavior:    (() => { try { return JSON.parse(d.behavior || '{}'); } catch(e) { return {}; } })(),
      }));
      db.results = resultRows.map(r => ({
        id:        r.id,
        studentId: r.student_id,
        subject:   r.subject_name,
        term:      r.term,
        session:   r.session,
        ca:        r.ca,
        exam:      r.exam,
        total:     r.total,
        class:     r.class_name,
        arm:       r.arm,
      }));
      if (resultRows.length) console.info(`[db] loaded ${resultRows.length} results for ${currentTerm} ${currentSession}`);
    } catch(e) {
      console.warn('[db] Could not load remarks/domains/results:', e.message);
      db.remarks           = [];
      db.domainAssessments = [];
      db.results           = [];
    }

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
    try {
      return await q1(
        `SELECT u.id, u.staff_id, u.student_id, u.name, u.email,
                u.role, u.assigned_class, u.assigned_arm, u.ward_id, u.active
         FROM users u
         WHERE u.id = ? AND u.active = 1 LIMIT 1`,
        [id]
      );
    } catch (e) {
      // DB not ready yet (cold-start) — fall back to in-memory cache
      console.warn('[db.getUserById] DB error, using cache:', e.message);
      return db.findUserById ? db.findUserById(id) : null;
    }
  },

  /* ── RESULT HELPERS ──────────────────────────────────────── */

  async findResult(studentId, subjectName, term, session) {
    const sc = db._subjectColName || 'subject_name';
    return q1(
      `SELECT * FROM results WHERE student_id=? AND ${sc}=? AND term=? AND session=?`,
      [studentId, subjectName, term, session]
    );
  },

  async countSubjectsForStudent(studentId, term, session) {
    const sc = db._subjectColName || 'subject_name';
    const row = await q1(
      `SELECT COUNT(DISTINCT ${sc}) AS cnt
       FROM results WHERE student_id=? AND term=? AND session=?`,
      [studentId, term, session]
    );
    return Number(row?.cnt) || 0;
  },

  async upsertResult(data) {
    const cls     = db.findClass(data.class);
    const classId = cls?.id ?? null;
    const subj    = db.subjects.find(s => s.name === data.subject);
    const subjId  = subj?.id ?? null;

    // Clamp scores
    const maxCA   = db.getMaxCA();
    const maxExam = db.getMaxExam();
    const caVal   = Math.min(maxCA,   Math.max(0, parseFloat(data.ca)   || 0));
    const examVal = Math.min(maxExam, Math.max(0, parseFloat(data.exam) || 0));
    const total   = caVal + examVal;

    // One-time detection of live schema shape (cached on db object)
    if (!db._schemaChecked) {
      try {
        const cols = await q(
          `SELECT COLUMN_NAME, EXTRA FROM INFORMATION_SCHEMA.COLUMNS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'results'`
        );
        const colMap = {};
        cols.forEach(c => { colMap[c.COLUMN_NAME] = (c.EXTRA || '').toLowerCase(); });

        // subject column name
        db._subjectColName = colMap['subject_name'] !== undefined ? 'subject_name'
          : colMap['subject']      !== undefined ? 'subject'
          : 'subject_name'; // fallback

        // is total a generated column?
        db._totalIsGenerated = colMap['total'] !== undefined &&
          (colMap['total'].includes('generated') || colMap['total'].includes('virtual') || colMap['total'].includes('stored'));

        // does class_id column exist?
        db._hasClassId = colMap['class_id'] !== undefined;

        db._schemaChecked = true;
        console.log(`[db] results schema: subjectCol="${db._subjectColName}" totalGenerated=${db._totalIsGenerated} hasClassId=${db._hasClassId}`);
      } catch (e) {
        console.warn('[db] schema check failed, using defaults:', e.message);
        db._subjectColName   = 'subject_name';
        db._totalIsGenerated = true;
        db._hasClassId       = true;
        db._schemaChecked    = true;
      }
    }

    const subCol     = db._subjectColName;
    const totalIsGen = db._totalIsGenerated;
    const hasClassId = db._hasClassId;

    // Build INSERT dynamically based on live schema
    const cols   = ['student_id', subCol, 'term', 'session', 'ca', 'exam'];
    const vals   = [data.studentId, data.subject, data.term, data.session, caVal, examVal];
    const update = ['ca=VALUES(ca)', 'exam=VALUES(exam)'];

    if (hasClassId) { cols.splice(1, 0, 'class_id'); vals.splice(1, 0, classId); }
    if (subCol === 'subject_name') { cols.splice(hasClassId ? 3 : 2, 0, 'subject_id'); vals.splice(hasClassId ? 3 : 2, 0, subjId); }
    if (!totalIsGen) { cols.push('total'); vals.push(total); update.push('total=VALUES(total)'); }
    if (!hasClassId) {
      // old schema had class_name
      cols.splice(1, 0, 'class_name'); vals.splice(1, 0, data.class || null);
    }
    cols.push('arm'); vals.push(data.arm || null);

    const placeholders = cols.map(() => '?').join(', ');
    const sql = `INSERT INTO results (${cols.join(', ')}) VALUES (${placeholders})
                 ON DUPLICATE KEY UPDATE ${update.join(', ')}`;

    try {
      await run(sql, vals);
    } catch (e) {
      // If we guessed wrong about schema, reset detection and retry once
      console.error('[db] upsertResult INSERT failed:', e.message);
      console.error('[db] SQL was:', sql);
      console.error('[db] Vals were:', vals);
      db._schemaChecked = false;
      throw e;
    }

    const saved = await q1(
      `SELECT * FROM results WHERE student_id=? AND ${subCol}=? AND term=? AND session=?`,
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
      ca:        caVal,
      exam:      examVal,
      total:     caVal + examVal,
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

  /* ── Settings helpers used by other controllers ─────────────────── */

  getGradingScale() {
    try {
      const raw = db._settings?.grading_scale;
      if (raw) {
        const scale = JSON.parse(raw);
        if (Array.isArray(scale) && scale.length) return scale;
      }
    } catch (e) {}
    // Default WAEC scale
    return [
      { min: 75, max: 100, grade: 'A1', remark: 'Excellent',  gpa: 5.0 },
      { min: 70, max:  74, grade: 'B2', remark: 'Very Good',  gpa: 4.0 },
      { min: 65, max:  69, grade: 'B3', remark: 'Good',       gpa: 3.5 },
      { min: 60, max:  64, grade: 'C4', remark: 'Credit',     gpa: 3.0 },
      { min: 55, max:  59, grade: 'C5', remark: 'Credit',     gpa: 2.5 },
      { min: 50, max:  54, grade: 'C6', remark: 'Credit',     gpa: 2.0 },
      { min: 45, max:  49, grade: 'D7', remark: 'Pass',       gpa: 1.5 },
      { min: 40, max:  44, grade: 'E8', remark: 'Weak Pass',  gpa: 1.0 },
      { min:  0, max:  39, grade: 'F9', remark: 'Fail',       gpa: 0.0 },
    ];
  },

  gradeScore(score) {
    const n     = parseFloat(score) || 0;
    const scale = db.getGradingScale();
    const match = scale.find(s => n >= s.min && n <= s.max);
    return match
      ? { grade: match.grade, remark: match.remark, gpa: match.gpa ?? null }
      : { grade: 'F9', remark: 'Fail', gpa: 0 };
  },

  getScoreBreakdown() {
    try {
      const raw = db._settings?.score_breakdown;
      if (raw) {
        const bk = JSON.parse(raw);
        if (bk && typeof bk === 'object' && Object.keys(bk).length) return bk;
      }
    } catch (e) {}
    return { 'CA': 40, 'Exam': 60 };
  },

  getMaxCA() {
    const bk = db.getScoreBreakdown();
    return Object.entries(bk)
      .filter(([k]) => /^ca/i.test(k))
      .reduce((s, [, v]) => s + v, 0) || 40;
  },

  getMaxExam() {
    const bk = db.getScoreBreakdown();
    const entry = Object.entries(bk).find(([k]) => /exam/i.test(k));
    return entry ? entry[1] : 60;
  },

  getPassMark() {
    return parseInt(db._settings?.pass_mark) || 40;
  },

  getMaxStudentSubjects() {
    return parseInt(db._settings?.max_subjects) || 9;
  },

  getPromotionSettings() {
    try {
      const raw = db._settings?.promotion_settings;
      if (raw) {
        const ps = JSON.parse(raw);
        if (ps && typeof ps === 'object') return ps;
      }
    } catch (e) {}
    return {
      enableCumulative: true,
      useAverage:       true,  minAverage:    40,
      usePassCount:     true,  minPassCount:  5,
      useNoFail:        false, noFailMark:    30,
      useAttendance:    false, minAttendance: 75,
      useCoreSubjects:  false, coreSubjects:  ['Mathematics', 'English Language'],
      labelPromoted:    'PROMOTED',
      labelRepeat:      'REPEAT',
      labelIncomplete:  'INCOMPLETE',
      showTermBreakdown:      true,
      showCumulativePosition: true,
      showPromotionBox:       true,
      showNextClass:          false,
    };
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