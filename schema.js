'use strict';
/**
 * schema.js — run once to create all tables
 * Usage: node schema.js
 */
require('dotenv').config();
const pool = require('./db');

const tables = [

/* ── Settings (key-value store for school info, grading, etc.) ── */
`CREATE TABLE IF NOT EXISTS settings (
  \`key\`       VARCHAR(200) NOT NULL PRIMARY KEY,
  \`value\`     LONGTEXT,
  updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

/* ── Users ── */
`CREATE TABLE IF NOT EXISTS users (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(120) NOT NULL,
  email       VARCHAR(160) UNIQUE,
  role        ENUM('Admin','Teacher','Student','Parent','Staff') NOT NULL DEFAULT 'Teacher',
  password    VARCHAR(255) NOT NULL,
  status      ENUM('active','suspended','disabled') DEFAULT 'active',
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

/* ── Classes ── */
`CREATE TABLE IF NOT EXISTS classes (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(60) NOT NULL UNIQUE,
  level       VARCHAR(40) DEFAULT 'Junior',
  arms        JSON,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

/* ── Students ── */
`CREATE TABLE IF NOT EXISTS students (
  id            VARCHAR(30) NOT NULL PRIMARY KEY,
  name          VARCHAR(120) NOT NULL,
  class_name    VARCHAR(60),
  arm           VARCHAR(10),
  gender        ENUM('Male','Female','Other') DEFAULT 'Male',
  dob           DATE,
  parent        VARCHAR(120),
  phone         VARCHAR(20),
  attendance    TINYINT UNSIGNED DEFAULT 100,
  status        VARCHAR(20) DEFAULT 'active',
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

/* ── Staff / Teachers ── */
`CREATE TABLE IF NOT EXISTS staff (
  id            VARCHAR(20) NOT NULL PRIMARY KEY,
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
  class_unit    VARCHAR(60),
  arm           VARCHAR(10),
  qualification VARCHAR(60),
  experience    VARCHAR(60),
  notes         TEXT,
  credentials   JSON,
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
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

/* ── Results ── */
`CREATE TABLE IF NOT EXISTS results (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  student_id  VARCHAR(30) NOT NULL,
  class_name  VARCHAR(60),
  arm         VARCHAR(10),
  subject     VARCHAR(80) NOT NULL,
  term        VARCHAR(30) NOT NULL,
  session     VARCHAR(20) NOT NULL,
  ca          TINYINT UNSIGNED DEFAULT 0,
  exam        TINYINT UNSIGNED DEFAULT 0,
  total       TINYINT UNSIGNED GENERATED ALWAYS AS (ca + exam) STORED,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY  uniq_result (student_id, subject, term, session)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

/* ── Remarks ── */
`CREATE TABLE IF NOT EXISTS remarks (
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
  class_name  VARCHAR(60),
  arm         VARCHAR(10),
  session     VARCHAR(20) NOT NULL,
  date        DATE NOT NULL,
  status      ENUM('present','absent','late','excused') DEFAULT 'present',
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

];

(async () => {
  try {
    for (const sql of tables) {
      await pool.query(sql);
      const match = sql.match(/CREATE TABLE IF NOT EXISTS (\w+)/);
      if (match) console.log(`  ✅ Table: ${match[1]}`);
    }

    /* Seed default admin user if none exists */
    const bcrypt = require('bcryptjs');
    const [[row]] = await pool.query('SELECT COUNT(*) AS cnt FROM users');
    if (row.cnt === 0) {
      const hash = await bcrypt.hash('admin1234', 10);
      await pool.query(
        'INSERT INTO users (name, email, role, password) VALUES (?, ?, ?, ?)',
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
      await pool.query(
        'INSERT INTO settings (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `key`=`key`',
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