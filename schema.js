'use strict';
/**
 * schema.js — run once to create all tables
 * Usage: node schema.js
 *
 * FIXES applied (vs original):
 *  1. `settings`      → renamed to `school_settings` (setting_key / setting_value columns)
 *  2. `classes`       → removed JSON `arms` column; added separate `class_arms` table
 *  3. `students`      → renamed `class_name` → `class_id` (INT FK); added `active` + `address`
 *  4. `users`         → added staff_id, student_id, assigned_class, assigned_arm,
 *                        ward_id, active; renamed `password` → `password_hash`
 *  5. `results`       → renamed `class_name`→`class_id`, `subject`→`subject_name`,
 *                        added `subject_id`; fixed UNIQUE key to use `subject_name`
 *  6. `report_card_remarks` → added (was missing; queried by studentController)
 *  7. `fee_structure` → added (queried by db.sync())
 *  8. `attendance`    → added `term` column; changed status ENUM to p/a/l/e codes
 *  9. `staff`         → renamed `class_unit` → `class_id` (FK)
 */
require('dotenv').config();
const db = require('./config/db');

const tables = [

/* ── School Settings (key-value store) ── */
`CREATE TABLE IF NOT EXISTS school_settings (
  setting_key    VARCHAR(200) NOT NULL PRIMARY KEY,
  setting_value  LONGTEXT,
  updated_at     DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

/* ── Users ── */
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

/* ── Classes ── */
`CREATE TABLE IF NOT EXISTS classes (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(60) NOT NULL UNIQUE,
  level       VARCHAR(40) DEFAULT 'Junior',
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

/* ── Class Arms (one row per arm per class) ── */
`CREATE TABLE IF NOT EXISTS class_arms (
  id        INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  class_id  INT UNSIGNED NOT NULL,
  arm       VARCHAR(10)  NOT NULL,
  UNIQUE KEY uniq_class_arm (class_id, arm),
  FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

/* ── Students ── */
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

/* ── Staff / Teachers ── */
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

/* ── Subjects ── */
`CREATE TABLE IF NOT EXISTS subjects (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(80) NOT NULL,
  code        VARCHAR(10) NOT NULL,
  level       VARCHAR(20) DEFAULT 'All',
  type        VARCHAR(30) DEFAULT 'Core',
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY  uniq_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

/* ── Fee Structure ── */
`CREATE TABLE IF NOT EXISTS fee_structure (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  label       VARCHAR(120) NOT NULL,
  amount      DECIMAL(10,2) NOT NULL DEFAULT 0,
  level       VARCHAR(40) DEFAULT 'All',
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

/* ── Results ── */
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

/* ── Report Card Remarks ── */
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

/* ── Attendance ── */
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
  saved_at    DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY  uniq_att (student_id, date, session)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

/* ── Domain Assessments ── */
`CREATE TABLE IF NOT EXISTS domain_assessments (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  student_id    VARCHAR(30) NOT NULL,
  term          VARCHAR(30) NOT NULL,
  session       VARCHAR(20) NOT NULL,
  cognitive     TINYINT,
  affective     TINYINT,
  psychomotor   TINYINT,
  behavior      JSON,
  updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY    uniq_domain (student_id, term, session)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

/* ── Subject Allocations ── */
`CREATE TABLE IF NOT EXISTS subject_allocations (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  alloc_key   VARCHAR(100) NOT NULL UNIQUE,
  subjects    JSON,
  updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

/* ── Fixtures ── */
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

/* ── Admissions ── */
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

/* ── Notices ── */
`CREATE TABLE IF NOT EXISTS notices (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  title       VARCHAR(200) NOT NULL,
  body        TEXT,
  audience    VARCHAR(20) DEFAULT 'all',
  pinned      TINYINT(1) DEFAULT 0,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

/* ── Staff Credentials ── (queried by staffController) */
`CREATE TABLE IF NOT EXISTS staff_credentials (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  staff_id    VARCHAR(20) NOT NULL,
  file_name   VARCHAR(255) NOT NULL,
  file_size   INT UNSIGNED DEFAULT NULL,
  file_type   VARCHAR(80)  DEFAULT NULL,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (staff_id) REFERENCES staff(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

/* ── Class Subject Allocations ── (queried by resultController) */
`CREATE TABLE IF NOT EXISTS class_subject_allocations (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  class_id   INT UNSIGNED NOT NULL,
  arm        VARCHAR(10)  NOT NULL,
  subject_id INT UNSIGNED NOT NULL,
  UNIQUE KEY uniq_class_arm_subj (class_id, arm, subject_id),
  FOREIGN KEY (class_id)   REFERENCES classes(id)  ON DELETE CASCADE,
  FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

/* ── Student Subject Allocations ── (queried by resultController) */
`CREATE TABLE IF NOT EXISTS student_subject_allocations (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  student_id VARCHAR(30)  NOT NULL,
  subject_id INT UNSIGNED NOT NULL,
  UNIQUE KEY uniq_student_subj (student_id, subject_id),
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

];

(async () => {
  try {
    for (const sql of tables) {
      await db.pool.query(sql);
      const match = sql.match(/CREATE TABLE IF NOT EXISTS (\w+)/);
      if (match) console.log(`  ✅ Table: ${match[1]}`);
    }

    /* Seed default admin user if none exists */
    const bcrypt = require('bcryptjs');
    const [rows] = await db.pool.query('SELECT COUNT(*) AS cnt FROM users');
    if (!rows[0] || rows[0].cnt === 0) {
      const hash = await bcrypt.hash('admin1234', 10);
      await db.pool.query(
        'INSERT INTO users (name, email, role, password_hash) VALUES (?, ?, ?, ?)',
        ['SAHARCO Admin', 'admin@sacredheartcollegeaba.com', 'Admin', hash]
      );
      console.log('\n  👤 Default admin created:');
      console.log('     Email:    admin@sacredheartcollegeaba.com');
      console.log('     Password: admin1234');
      console.log('     ⚠️  Change the password after first login!\n');
    }

    /* Seed default school settings */
    const defaultSettings = [
      ['school_name',     'Sacred Heart College Eziukwu Aba'],
      ['current_session', '2025/2026'],
      ['current_term',    'Second Term'],
      ['principal_name',  'Rev. Fr. Sullivan Obinna Achilihu'],
    ];
    for (const pair of defaultSettings) {
      await db.pool.query(
        'INSERT INTO school_settings (setting_key, setting_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE setting_key=setting_key',
        [pair[0], pair[1]]
      );
    }
    console.log('  ✅ Default settings seeded');
    console.log('\n🎉 Schema ready!\n');
  } catch (err) {
    console.error('Schema error:', err.message);
  } finally {
    process.exit(0);
  }
})();