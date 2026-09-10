'use strict';
/**
 * schema.js — Sacred Heart College Eziukwu Aba (SAHARCO)
 * Run once to create / upgrade all tables: node schema.js
 *
 * Safe to re-run — every statement uses CREATE TABLE IF NOT EXISTS
 * or ALTER TABLE ... ADD COLUMN IF NOT EXISTS.
 *
 * Tables (in dependency order):
 *  1.  school_settings
 *  2.  users
 *  3.  classes
 *  4.  class_arms
 *  5.  students
 *  6.  staff
 *  7.  subjects
 *  8.  fee_structure          ← upgraded (class_name, term, session, mandatory, description)
 *  9.  fee_payments
 * 10.  fee_ledger             ← NEW: lifetime student account
 * 11.  levies                 ← NEW: sports/graduation/interhouse etc.
 * 12.  levy_payments          ← NEW: who paid which levy
 * 13.  results
 * 14.  report_card_remarks
 * 15.  attendance
 * 16.  domain_assessments
 * 17.  subject_allocations
 * 18.  class_subject_allocations
 * 19.  student_subject_allocations
 * 20.  timetables             ← NEW: per-class grid stored as JSON
 * 21.  access_tokens          ← NEW: parent portal tokens (persistent)
 * 22.  fixtures
 * 23.  admissions
 * 24.  notices
 * 25.  staff_credentials
 * 26.  student_archive        ← NEW: former students
 * 27.  staff_archive          ← NEW: former staff
 */

require('dotenv').config();
const db = require('./config/db');

const tables = [

/* ── 1. School Settings ─────────────────────────────────────────────────── */
`CREATE TABLE IF NOT EXISTS school_settings (
  setting_key    VARCHAR(200) NOT NULL PRIMARY KEY,
  setting_value  LONGTEXT,
  updated_at     DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

/* ── 2. Users ───────────────────────────────────────────────────────────── */
`CREATE TABLE IF NOT EXISTS users (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  staff_id        VARCHAR(20)  DEFAULT NULL,
  student_id      VARCHAR(30)  DEFAULT NULL,
  name            VARCHAR(120) NOT NULL,
  email           VARCHAR(160) UNIQUE,
  role            ENUM('Admin','Teacher','Student','Parent','Staff') NOT NULL DEFAULT 'Teacher',
  password_hash   VARCHAR(255) NOT NULL,
  assigned_class  VARCHAR(60)  DEFAULT NULL,
  assigned_arm    VARCHAR(10)  DEFAULT NULL,
  ward_id         VARCHAR(30)  DEFAULT NULL,
  active          TINYINT(1)   NOT NULL DEFAULT 1,
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

/* ── 3. Classes ─────────────────────────────────────────────────────────── */
`CREATE TABLE IF NOT EXISTS classes (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(60) NOT NULL UNIQUE,
  level       VARCHAR(40) DEFAULT 'Junior',
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

/* ── 4. Class Arms ──────────────────────────────────────────────────────── */
`CREATE TABLE IF NOT EXISTS class_arms (
  id        INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  class_id  INT UNSIGNED NOT NULL,
  arm       VARCHAR(10)  NOT NULL,
  UNIQUE KEY uniq_class_arm (class_id, arm),
  FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

/* ── 5. Students ────────────────────────────────────────────────────────── */
`CREATE TABLE IF NOT EXISTS students (
  id            VARCHAR(30)  NOT NULL PRIMARY KEY,
  name          VARCHAR(120) NOT NULL,
  class_id      INT UNSIGNED DEFAULT NULL,
  arm           VARCHAR(10),
  gender        ENUM('Male','Female','Other') DEFAULT 'Male',
  dob           DATE,
  parent        VARCHAR(120),
  phone         VARCHAR(20),
  address       VARCHAR(255),
  attendance    TINYINT UNSIGNED DEFAULT 100,
  active        TINYINT(1) NOT NULL DEFAULT 1,
  status        VARCHAR(20) DEFAULT 'active',
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

/* ── 6. Staff ───────────────────────────────────────────────────────────── */
`CREATE TABLE IF NOT EXISTS staff (
  id            VARCHAR(20)  NOT NULL PRIMARY KEY,
  name          VARCHAR(120) NOT NULL,
  gender        VARCHAR(10),
  phone         VARCHAR(20),
  email         VARCHAR(160),
  date_joined   DATE,
  status        VARCHAR(20) DEFAULT 'Active',
  category      VARCHAR(30) DEFAULT 'Academic',
  position      VARCHAR(80),
  department    VARCHAR(80),
  subject       VARCHAR(80),
  class_id      INT UNSIGNED DEFAULT NULL,
  arm           VARCHAR(10),
  qualification VARCHAR(60),
  experience    VARCHAR(60),
  notes         TEXT,
  credentials   JSON,
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

/* ── 7. Subjects ────────────────────────────────────────────────────────── */
`CREATE TABLE IF NOT EXISTS subjects (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(80) NOT NULL,
  code        VARCHAR(10) NOT NULL,
  level       VARCHAR(20) DEFAULT 'All',
  type        VARCHAR(30) DEFAULT 'Core',
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY  uniq_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

/* ── 8. Fee Structure ───────────────────────────────────────────────────── */
/* Per-class / per-level / per-term fee schedule                             */
`CREATE TABLE IF NOT EXISTS fee_structure (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  label       VARCHAR(120) NOT NULL,
  amount      DECIMAL(10,2) NOT NULL DEFAULT 0,
  level       VARCHAR(40)  DEFAULT 'All'  COMMENT 'All | Junior | Senior',
  class_name  VARCHAR(60)  DEFAULT NULL   COMMENT 'Specific class override e.g. SS 3',
  term        VARCHAR(30)  DEFAULT NULL   COMMENT 'NULL = applies every term',
  session     VARCHAR(20)  DEFAULT NULL   COMMENT 'NULL = applies every session',
  mandatory   TINYINT(1)   DEFAULT 1,
  description TEXT         DEFAULT NULL,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

/* ── 9. Fee Payments ────────────────────────────────────────────────────── */
`CREATE TABLE IF NOT EXISTS fee_payments (
  id            VARCHAR(30)  NOT NULL PRIMARY KEY,
  student_id    VARCHAR(30)  NOT NULL,
  fee_type      VARCHAR(80)  NOT NULL,
  amount        DECIMAL(10,2) NOT NULL DEFAULT 0,
  payment_date  DATE         NOT NULL,
  term          VARCHAR(30)  NOT NULL,
  session       VARCHAR(20)  DEFAULT NULL,
  status        ENUM('Paid','Partial','Unpaid','Waived','overdue') DEFAULT 'Paid',
  reference     VARCHAR(100) DEFAULT NULL,
  note          TEXT         DEFAULT NULL,
  created_by    VARCHAR(120) DEFAULT NULL,
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

/* ── 10. Fee Ledger ─────────────────────────────────────────────────────── */
/* Comprehensive lifetime debit/credit account per student                   */
`CREATE TABLE IF NOT EXISTS fee_ledger (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  student_id     VARCHAR(30)  NOT NULL,
  payment_id     VARCHAR(30)  DEFAULT NULL  COMMENT 'Links to fee_payments.id',
  entry_type     ENUM('charge','payment','waiver','adjustment','refund') NOT NULL DEFAULT 'payment',
  description    VARCHAR(200) NOT NULL,
  debit          DECIMAL(10,2) DEFAULT 0    COMMENT 'Amount owed (charge)',
  credit         DECIMAL(10,2) DEFAULT 0    COMMENT 'Amount paid/waived',
  balance        DECIMAL(10,2) DEFAULT 0    COMMENT 'Running balance at time of entry',
  term           VARCHAR(30)  DEFAULT NULL,
  session        VARCHAR(20)  DEFAULT NULL,
  academic_year  VARCHAR(20)  DEFAULT NULL,
  class_at_time  VARCHAR(60)  DEFAULT NULL,
  reference      VARCHAR(100) DEFAULT NULL,
  created_by     VARCHAR(120) DEFAULT NULL,
  created_at     DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

/* ── 11. Levies ─────────────────────────────────────────────────────────── */
/* Special one-off fees: sports, graduation, interhouse, excursion, etc.    */
`CREATE TABLE IF NOT EXISTS levies (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(120) NOT NULL,
  category    ENUM('Sports','Graduation','Cultural','Interhouse','Excursion',
                   'Uniform','ID Card','Library','Technology','Medical','Other')
              DEFAULT 'Other',
  amount      DECIMAL(10,2) NOT NULL DEFAULT 0,
  target      ENUM('All','Junior','Senior','Class','Individual') DEFAULT 'All',
  class_name  VARCHAR(60)  DEFAULT NULL,
  arm         VARCHAR(10)  DEFAULT NULL,
  term        VARCHAR(30)  DEFAULT NULL,
  session     VARCHAR(20)  DEFAULT NULL,
  due_date    DATE         DEFAULT NULL,
  description TEXT         DEFAULT NULL,
  mandatory   TINYINT(1)   DEFAULT 1,
  active      TINYINT(1)   DEFAULT 1,
  created_by  VARCHAR(120) DEFAULT NULL,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

/* ── 12. Levy Payments ──────────────────────────────────────────────────── */
`CREATE TABLE IF NOT EXISTS levy_payments (
  id            VARCHAR(30)  NOT NULL PRIMARY KEY,
  levy_id       INT UNSIGNED NOT NULL,
  student_id    VARCHAR(30)  NOT NULL,
  amount_paid   DECIMAL(10,2) NOT NULL DEFAULT 0,
  payment_date  DATE         NOT NULL,
  status        ENUM('Paid','Partial','Unpaid','Waived','Exempt') DEFAULT 'Paid',
  reference     VARCHAR(100) DEFAULT NULL,
  note          TEXT         DEFAULT NULL,
  created_by    VARCHAR(120) DEFAULT NULL,
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (levy_id) REFERENCES levies(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

/* ── 13. Results ────────────────────────────────────────────────────────── */
`CREATE TABLE IF NOT EXISTS results (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  student_id   VARCHAR(30)  NOT NULL,
  class_id     INT UNSIGNED DEFAULT NULL,
  arm          VARCHAR(10),
  subject_id   INT UNSIGNED DEFAULT NULL,
  subject_name VARCHAR(80)  NOT NULL,
  term         VARCHAR(30)  NOT NULL,
  session      VARCHAR(20)  NOT NULL,
  ca           TINYINT UNSIGNED DEFAULT 0,
  exam         TINYINT UNSIGNED DEFAULT 0,
  total        TINYINT UNSIGNED GENERATED ALWAYS AS (ca + exam) STORED,
  created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY   uniq_result (student_id, subject_name, term, session)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

/* ── 14. Report Card Remarks ────────────────────────────────────────────── */
`CREATE TABLE IF NOT EXISTS report_card_remarks (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  student_id        VARCHAR(30) NOT NULL,
  term              VARCHAR(30) NOT NULL,
  session           VARCHAR(20) NOT NULL,
  teacher_remark    TEXT,
  principal_remark  TEXT,
  updated_at        DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY        uniq_remark (student_id, term, session)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

/* ── 15. Attendance ─────────────────────────────────────────────────────── */
`CREATE TABLE IF NOT EXISTS attendance (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  student_id  VARCHAR(30) NOT NULL,
  class_id    INT UNSIGNED DEFAULT NULL,
  arm         VARCHAR(10),
  session     VARCHAR(20) NOT NULL,
  term        VARCHAR(30) NOT NULL DEFAULT '',
  date        DATE NOT NULL,
  status      ENUM('p','a','l','e') DEFAULT 'p'
               COMMENT 'p=present a=absent l=late e=excused',
  remarks     TEXT DEFAULT NULL,
  saved_at    DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY  uniq_att (student_id, date, session)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

/* ── 16. Domain Assessments ─────────────────────────────────────────────── */
`CREATE TABLE IF NOT EXISTS domain_assessments (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  student_id    VARCHAR(30) NOT NULL,
  term          VARCHAR(30) NOT NULL,
  session       VARCHAR(20) NOT NULL,
  cognitive     TINYINT,
  affective     TINYINT,
  psychomotor   TINYINT,
  behavior_0    TINYINT DEFAULT NULL,
  behavior_1    TINYINT DEFAULT NULL,
  behavior_2    TINYINT DEFAULT NULL,
  behavior_3    TINYINT DEFAULT NULL,
  behavior_4    TINYINT DEFAULT NULL,
  behavior_5    TINYINT DEFAULT NULL,
  behavior_6    TINYINT DEFAULT NULL,
  behavior_7    TINYINT DEFAULT NULL,
  updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY    uniq_domain (student_id, term, session)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

/* ── 17. Subject Allocations (key-value JSON) ───────────────────────────── */
`CREATE TABLE IF NOT EXISTS subject_allocations (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  alloc_key   VARCHAR(100) NOT NULL UNIQUE,
  subjects    JSON,
  updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

/* ── 18. Class Subject Allocations ─────────────────────────────────────── */
`CREATE TABLE IF NOT EXISTS class_subject_allocations (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  class_id   INT UNSIGNED NOT NULL,
  arm        VARCHAR(10)  NOT NULL,
  subject_id INT UNSIGNED NOT NULL,
  UNIQUE KEY uniq_class_arm_subj (class_id, arm, subject_id),
  FOREIGN KEY (class_id)   REFERENCES classes(id)  ON DELETE CASCADE,
  FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

/* ── 19. Student Subject Allocations ───────────────────────────────────── */
`CREATE TABLE IF NOT EXISTS student_subject_allocations (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  student_id VARCHAR(30)  NOT NULL,
  subject_id INT UNSIGNED NOT NULL,
  UNIQUE KEY uniq_student_subj (student_id, subject_id),
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

/* ── 20. Timetables ─────────────────────────────────────────────────────── */
/* Full weekly grid stored as JSON per class/arm combination                */
`CREATE TABLE IF NOT EXISTS timetables (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  class_key  VARCHAR(80)  NOT NULL UNIQUE COMMENT 'Format: ClassName_Arm e.g. JSS1_A',
  class_name VARCHAR(60)  NOT NULL,
  arm        VARCHAR(10)  NOT NULL,
  grid       JSON         NOT NULL COMMENT 'Full timetable grid { Monday: { 8:00: subject } }',
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  updated_by VARCHAR(120) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

/* ── 21. Access Tokens ──────────────────────────────────────────────────── */
/* Parent portal tokens — persisted so they survive server restarts         */
`CREATE TABLE IF NOT EXISTS access_tokens (
  code         VARCHAR(40)  NOT NULL PRIMARY KEY,
  student_id   VARCHAR(30)  NOT NULL,
  student_name VARCHAR(120) DEFAULT NULL,
  class_name   VARCHAR(60)  DEFAULT NULL,
  arm          VARCHAR(10)  DEFAULT NULL,
  term         VARCHAR(30)  DEFAULT NULL,
  session      VARCHAR(20)  DEFAULT NULL,
  expires_at   DATETIME     NOT NULL,
  max_uses     INT UNSIGNED DEFAULT NULL,
  used         INT UNSIGNED NOT NULL DEFAULT 0,
  revoked      TINYINT(1)   NOT NULL DEFAULT 0,
  created_by   VARCHAR(120) DEFAULT NULL,
  created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

/* ── 22. Fixtures (Sports / Events) ────────────────────────────────────── */
`CREATE TABLE IF NOT EXISTS fixtures (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  type        VARCHAR(40),
  team_a      VARCHAR(60),
  team_b      VARCHAR(60),
  date        DATE,
  time        VARCHAR(10),
  venue       VARCHAR(120),
  status      VARCHAR(20) DEFAULT 'Upcoming',
  score_a     TINYINT,
  score_b     TINYINT,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

/* ── 23. Admissions ─────────────────────────────────────────────────────── */
`CREATE TABLE IF NOT EXISTS admissions (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  first_name      VARCHAR(60) NOT NULL,
  last_name       VARCHAR(60) NOT NULL,
  middle_name     VARCHAR(60),
  gender          VARCHAR(10),
  dob             DATE,
  blood_group     VARCHAR(5),
  genotype        VARCHAR(5),
  state_origin    VARCHAR(60),
  lga             VARCHAR(60),
  address         TEXT,
  class_apply     VARCHAR(60),
  preferred_arm   VARCHAR(10),
  acad_session    VARCHAR(20),
  entry_term      VARCHAR(30),
  prev_school     VARCHAR(120),
  last_class      VARCHAR(60),
  guardian_name   VARCHAR(120),
  guardian_phone  VARCHAR(20),
  guardian_email  VARCHAR(160),
  guardian_addr   TEXT,
  relation        VARCHAR(40),
  status          ENUM('Draft','Pending','Approved','Enrolled','Rejected') DEFAULT 'Pending',
  notes           TEXT,
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

/* ── 24. Notices ────────────────────────────────────────────────────────── */
`CREATE TABLE IF NOT EXISTS notices (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  title       VARCHAR(200) NOT NULL,
  body        TEXT,
  audience    VARCHAR(20) DEFAULT 'all',
  pinned      TINYINT(1) DEFAULT 0,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

/* ── 25. Staff Credentials ──────────────────────────────────────────────── */
`CREATE TABLE IF NOT EXISTS staff_credentials (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  staff_id    VARCHAR(20) NOT NULL,
  file_name   VARCHAR(255) NOT NULL,
  file_size   INT UNSIGNED DEFAULT NULL,
  file_type   VARCHAR(80)  DEFAULT NULL,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (staff_id) REFERENCES staff(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

/* ── 26. Student Archive ────────────────────────────────────────────────── */
/* Former students — graduated, transferred, withdrawn, etc.                */
`CREATE TABLE IF NOT EXISTS student_archive (
  id              VARCHAR(30)  NOT NULL PRIMARY KEY COMMENT 'Retains original student ID',
  name            VARCHAR(120) NOT NULL,
  last_class      VARCHAR(60),
  last_arm        VARCHAR(10),
  gender          ENUM('Male','Female','Other') DEFAULT 'Male',
  dob             DATE,
  parent          VARCHAR(120),
  phone           VARCHAR(20),
  address         VARCHAR(255),
  admission_year  VARCHAR(10),
  exit_year       VARCHAR(10),
  exit_term       VARCHAR(30),
  exit_session    VARCHAR(20),
  exit_reason     ENUM('Graduated','Transferred','Withdrawn','Expelled','Deceased','Unknown') DEFAULT 'Graduated',
  exit_note       TEXT,
  final_gpa       DECIMAL(4,2) DEFAULT NULL,
  final_position  VARCHAR(20)  DEFAULT NULL,
  certificate_no  VARCHAR(50)  DEFAULT NULL,
  forwarding_addr VARCHAR(255) DEFAULT NULL,
  archived_by     VARCHAR(120) DEFAULT NULL,
  archived_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
  original_data   JSON         DEFAULT NULL COMMENT 'Full snapshot of student record at exit'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

/* ── 27. Staff Archive ──────────────────────────────────────────────────── */
/* Former staff — resigned, retired, dismissed, transferred, etc.           */
`CREATE TABLE IF NOT EXISTS staff_archive (
  id              VARCHAR(20)  NOT NULL PRIMARY KEY COMMENT 'Retains original staff ID',
  name            VARCHAR(120) NOT NULL,
  gender          VARCHAR(10),
  phone           VARCHAR(20),
  email           VARCHAR(160),
  date_joined     DATE,
  date_left       DATE,
  exit_year       VARCHAR(10),
  category        VARCHAR(30),
  position        VARCHAR(80),
  department      VARCHAR(80),
  subject         VARCHAR(80),
  qualification   VARCHAR(60),
  experience      VARCHAR(60),
  exit_reason     ENUM('Resigned','Retired','Dismissed','Contract Ended','Transfer','Deceased','Unknown') DEFAULT 'Resigned',
  exit_note       TEXT,
  service_years   DECIMAL(4,1) DEFAULT NULL COMMENT 'Auto-computed from join and exit dates',
  reference_given TINYINT(1)   DEFAULT 0,
  last_class      VARCHAR(60),
  last_arm        VARCHAR(10),
  archived_by     VARCHAR(120) DEFAULT NULL,
  archived_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
  original_data   JSON         DEFAULT NULL COMMENT 'Full snapshot of staff record at exit'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

];

/* ── Column upgrades for existing deployments ───────────────────────────── */
/* These ALTER statements add new columns to tables that may already exist.
   They are safe to run multiple times (IF NOT EXISTS).                     */
const upgrades = [
  // fee_structure — add new columns if upgrading from old schema
  `ALTER TABLE fee_structure ADD COLUMN IF NOT EXISTS class_name  VARCHAR(60)  DEFAULT NULL AFTER level`,
  `ALTER TABLE fee_structure ADD COLUMN IF NOT EXISTS term        VARCHAR(30)  DEFAULT NULL AFTER class_name`,
  `ALTER TABLE fee_structure ADD COLUMN IF NOT EXISTS session     VARCHAR(20)  DEFAULT NULL AFTER term`,
  `ALTER TABLE fee_structure ADD COLUMN IF NOT EXISTS mandatory   TINYINT(1)   DEFAULT 1    AFTER session`,
  `ALTER TABLE fee_structure ADD COLUMN IF NOT EXISTS description TEXT         DEFAULT NULL AFTER mandatory`,
  `ALTER TABLE fee_structure ADD COLUMN IF NOT EXISTS updated_at  DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER created_at`,
  // attendance — add remarks column
  `ALTER TABLE attendance ADD COLUMN IF NOT EXISTS remarks TEXT DEFAULT NULL AFTER status`,
  // domain_assessments — replace JSON behavior with flat columns
  `ALTER TABLE domain_assessments DROP COLUMN IF EXISTS behavior`,
  `ALTER TABLE domain_assessments ADD COLUMN IF NOT EXISTS behavior_0 TINYINT DEFAULT NULL AFTER psychomotor`,
  `ALTER TABLE domain_assessments ADD COLUMN IF NOT EXISTS behavior_1 TINYINT DEFAULT NULL AFTER behavior_0`,
  `ALTER TABLE domain_assessments ADD COLUMN IF NOT EXISTS behavior_2 TINYINT DEFAULT NULL AFTER behavior_1`,
  `ALTER TABLE domain_assessments ADD COLUMN IF NOT EXISTS behavior_3 TINYINT DEFAULT NULL AFTER behavior_2`,
  `ALTER TABLE domain_assessments ADD COLUMN IF NOT EXISTS behavior_4 TINYINT DEFAULT NULL AFTER behavior_3`,
  `ALTER TABLE domain_assessments ADD COLUMN IF NOT EXISTS behavior_5 TINYINT DEFAULT NULL AFTER behavior_4`,
  `ALTER TABLE domain_assessments ADD COLUMN IF NOT EXISTS behavior_6 TINYINT DEFAULT NULL AFTER behavior_5`,
  `ALTER TABLE domain_assessments ADD COLUMN IF NOT EXISTS behavior_7 TINYINT DEFAULT NULL AFTER behavior_6`,
];

(async () => {
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║   Sacred Heart College — Schema Setup                   ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  try {
    /* ── Create / verify tables ── */
    console.log('  Creating tables…');
    for (const sql of tables) {
      await db.pool.query(sql);
      const match = sql.match(/CREATE TABLE IF NOT EXISTS (\w+)/);
      if (match) console.log(`  ✅  ${match[1]}`);
    }

    /* ── Apply column upgrades ── */
    console.log('\n  Applying column upgrades…');
    for (const sql of upgrades) {
      try {
        await db.pool.query(sql);
        const label = sql.trim().replace(/\s+/g, ' ').substring(0, 72);
        console.log(`  ✅  ${label}`);
      } catch (e) {
        // Ignore "Can't DROP" errors — column already removed
        if (!e.message.includes("Can't DROP") && !e.message.includes('check that column')) {
          console.warn(`  ⚠️   ${e.message.substring(0, 90)}`);
        }
      }
    }

    /* ── Seed default admin user if none exists ── */
    console.log('\n  Checking admin user…');
    const bcrypt = require('bcryptjs');
    const [rows] = await db.pool.query('SELECT COUNT(*) AS cnt FROM users');
    if (!rows[0] || rows[0].cnt === 0) {
      const hash = await bcrypt.hash('admin1234', 10);
      await db.pool.query(
        'INSERT INTO users (name, email, role, password_hash) VALUES (?, ?, ?, ?)',
        ['SAHARCO Admin', 'admin@sacredheartcollegeaba.com', 'Admin', hash]
      );
      console.log('  ✅  Default admin created');
      console.log('      Email:    admin@sacredheartcollegeaba.com');
      console.log('      Password: admin1234');
      console.log('      ⚠️   Change the password after first login!');
    } else {
      console.log('  ✅  Admin user exists — skipped');
    }

    /* ── Seed default school settings ── */
    console.log('\n  Seeding default school settings…');
    const defaults = [
      ['school_name',     'Sacred Heart College Eziukwu Aba'],
      ['current_session', '2025/2026'],
      ['current_term',    'Second Term'],
      ['principal_name',  'Rev. Fr. Sullivan Obinna Achilihu'],
    ];
    for (const [k, v] of defaults) {
      await db.pool.query(
        `INSERT INTO school_settings (setting_key, setting_value)
         VALUES (?, ?) ON DUPLICATE KEY UPDATE setting_key=setting_key`,
        [k, v]
      );
    }
    console.log('  ✅  School settings seeded');

    console.log('\n🎉  Schema ready!\n');
  } catch (err) {
    console.error('\n❌  Schema error:', err.message, '\n');
    process.exitCode = 1;
  } finally {
    process.exit(process.exitCode || 0);
  }
})();