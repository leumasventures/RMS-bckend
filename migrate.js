'use strict';

/**
 * migrate.js — Apply schema fixes to the live database
 * Run: node migrate.js
 *
 * Safe to run multiple times — uses ALTER TABLE IF NOT EXISTS pattern.
 */

require('dotenv').config();
const db = require('./config/db');

const migrations = [

  /* Fix 0: Ensure fixtures table exists */
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

  /* Fix 0b: Ensure fee_payments table exists */
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

  /* Fix 1: Add remarks column to attendance (was missing; controller inserts it) */
  `ALTER TABLE attendance
   ADD COLUMN IF NOT EXISTS remarks TEXT DEFAULT NULL
   AFTER status`,

  /* Fix 2: Drop old JSON behavior column and add flat behavior columns to domain_assessments */
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
// Exported separately — also add fee_payments table to live DB
// Run: node -e "require('./config/db').pool.query(\`CREATE TABLE IF NOT EXISTS fee_payments (id VARCHAR(30) NOT NULL PRIMARY KEY, student_id VARCHAR(30) NOT NULL, fee_type VARCHAR(80) NOT NULL, amount DECIMAL(10,2) NOT NULL DEFAULT 0, payment_date DATE NOT NULL, term VARCHAR(30) NOT NULL, session VARCHAR(20), status ENUM('Paid','Partial','Unpaid','Waived','overdue') DEFAULT 'Paid', reference VARCHAR(100), note TEXT, created_by VARCHAR(120), created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4\`).then(()=>process.exit())"