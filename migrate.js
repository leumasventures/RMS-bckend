'use strict';
require('dotenv').config();
const db = require('./config/db');

const migrations = [

  `CREATE TABLE IF NOT EXISTS fixtures (
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
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

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
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS fee_ledger (
    id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    student_id     VARCHAR(30)  NOT NULL,
    payment_id     VARCHAR(30)  DEFAULT NULL,
    entry_type     ENUM('charge','payment','waiver','adjustment','refund') NOT NULL DEFAULT 'payment',
    description    VARCHAR(200) NOT NULL,
    debit          DECIMAL(10,2) DEFAULT 0,
    credit         DECIMAL(10,2) DEFAULT 0,
    balance        DECIMAL(10,2) DEFAULT 0,
    term           VARCHAR(30)  DEFAULT NULL,
    session        VARCHAR(20)  DEFAULT NULL,
    academic_year  VARCHAR(20)  DEFAULT NULL,
    class_at_time  VARCHAR(60)  DEFAULT NULL,
    reference      VARCHAR(100) DEFAULT NULL,
    created_by     VARCHAR(120) DEFAULT NULL,
    created_at     DATETIME DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  /* Upgrade fee_structure with new columns if missing */
  `ALTER TABLE fee_structure ADD COLUMN IF NOT EXISTS class_name VARCHAR(60) DEFAULT NULL AFTER level`,
  `ALTER TABLE fee_structure ADD COLUMN IF NOT EXISTS term VARCHAR(30) DEFAULT NULL AFTER class_name`,
  `ALTER TABLE fee_structure ADD COLUMN IF NOT EXISTS session VARCHAR(20) DEFAULT NULL AFTER term`,
  `ALTER TABLE fee_structure ADD COLUMN IF NOT EXISTS mandatory TINYINT(1) DEFAULT 1 AFTER session`,
  `ALTER TABLE fee_structure ADD COLUMN IF NOT EXISTS description TEXT DEFAULT NULL AFTER mandatory`,
  `ALTER TABLE fee_structure ADD COLUMN IF NOT EXISTS updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER created_at`,

  /* Timetable — stored as JSON per class/arm, with one row per key */
  `CREATE TABLE IF NOT EXISTS timetables (
    id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    class_key  VARCHAR(80)  NOT NULL UNIQUE COMMENT 'Format: ClassName_Arm e.g. JSS1_A',
    class_name VARCHAR(60)  NOT NULL,
    arm        VARCHAR(10)  NOT NULL,
    grid       JSON         NOT NULL COMMENT 'Full timetable grid { Monday: { 8:00: subject } }',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    updated_by VARCHAR(120) DEFAULT NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  /* Access tokens — persistent storage */
  `CREATE TABLE IF NOT EXISTS access_tokens (
    code        VARCHAR(40)  NOT NULL PRIMARY KEY,
    student_id  VARCHAR(30)  NOT NULL,
    student_name VARCHAR(120) DEFAULT NULL,
    class_name  VARCHAR(60)  DEFAULT NULL,
    arm         VARCHAR(10)  DEFAULT NULL,
    term        VARCHAR(30)  DEFAULT NULL,
    session     VARCHAR(20)  DEFAULT NULL,
    expires_at  DATETIME     NOT NULL,
    max_uses    INT UNSIGNED DEFAULT NULL,
    used        INT UNSIGNED NOT NULL DEFAULT 0,
    revoked     TINYINT(1)   NOT NULL DEFAULT 0,
    created_by  VARCHAR(120) DEFAULT NULL,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `ALTER TABLE attendance
   ADD COLUMN IF NOT EXISTS remarks TEXT DEFAULT NULL
   AFTER status`,

  `ALTER TABLE domain_assessments
   DROP COLUMN IF EXISTS behavior`,

  `ALTER TABLE domain_assessments
   ADD COLUMN IF NOT EXISTS behavior_0 TINYINT DEFAULT NULL AFTER psychomotor`,
  `ALTER TABLE domain_assessments
   ADD COLUMN IF NOT EXISTS behavior_1 TINYINT DEFAULT NULL AFTER behavior_0`,
  `ALTER TABLE domain_assessments
   ADD COLUMN IF NOT EXISTS behavior_2 TINYINT DEFAULT NULL AFTER behavior_1`,
  `ALTER TABLE domain_assessments
   ADD COLUMN IF NOT EXISTS behavior_3 TINYINT DEFAULT NULL AFTER behavior_2`,
  `ALTER TABLE domain_assessments
   ADD COLUMN IF NOT EXISTS behavior_4 TINYINT DEFAULT NULL AFTER behavior_3`,
  `ALTER TABLE domain_assessments
   ADD COLUMN IF NOT EXISTS behavior_5 TINYINT DEFAULT NULL AFTER behavior_4`,
  `ALTER TABLE domain_assessments
   ADD COLUMN IF NOT EXISTS behavior_6 TINYINT DEFAULT NULL AFTER behavior_5`,
  `ALTER TABLE domain_assessments
   ADD COLUMN IF NOT EXISTS behavior_7 TINYINT DEFAULT NULL AFTER behavior_6`,
];

(async () => {
  console.log('\n  Running migrations…\n');
  let passed = 0, failed = 0;
  for (const sql of migrations) {
    const label = sql.trim().split('\n')[0].substring(0, 70);
    try {
      await db.pool.query(sql);
      console.log(`  ✅  ${label}`);
      passed++;
    } catch (err) {
      console.error(`  ❌  ${label}`);
      console.error(`       ${err.message}`);
      failed++;
    }
  }
  console.log(`\n  Done: ${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
})();