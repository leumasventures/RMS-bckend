'use strict';
/**
 * migrate-parent-portal.js — Sacred Heart College
 * Run with: node migrate-parent-portal.js
 *
 * This migration is SAFE to re-run.
 * It adds the tables and columns needed by the parent portal update.
 */
require('dotenv').config();
const db = require('./config/db');

const steps = [

  /* ── Ensure Bursar role exists in users.role ENUM ── */
  {
    label: 'Add Bursar to users.role ENUM',
    sql: `ALTER TABLE users MODIFY COLUMN role
          ENUM('Admin','Teacher','Student','Parent','Staff','Bursar')
          NOT NULL DEFAULT 'Teacher'`,
  },

  /* ── signup_requests table (for parent/staff self-registration) ── */
  {
    label: 'Create signup_requests table',
    sql: `CREATE TABLE IF NOT EXISTS signup_requests (
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
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  },

  /* ── access_tokens — ensure all columns exist ── */
  {
    label: 'access_tokens: add student_name column if missing',
    sql: `ALTER TABLE access_tokens
          ADD COLUMN IF NOT EXISTS student_name VARCHAR(120) DEFAULT NULL AFTER student_id`,
  },
  {
    label: 'access_tokens: add class_name column if missing',
    sql: `ALTER TABLE access_tokens
          ADD COLUMN IF NOT EXISTS class_name VARCHAR(60) DEFAULT NULL AFTER student_name`,
  },
  {
    label: 'access_tokens: add arm column if missing',
    sql: `ALTER TABLE access_tokens
          ADD COLUMN IF NOT EXISTS arm VARCHAR(10) DEFAULT NULL AFTER class_name`,
  },
  {
    label: 'access_tokens: add session column if missing',
    sql: `ALTER TABLE access_tokens
          ADD COLUMN IF NOT EXISTS session VARCHAR(20) DEFAULT NULL AFTER term`,
  },

  /* ── students — add parent_phone alias if phone is the only column ── */
  // (No schema change needed — phone column is already present)

  /* ── Verify access_tokens table exists (create if fresh DB) ── */
  {
    label: 'Create access_tokens table if not exists',
    sql: `CREATE TABLE IF NOT EXISTS access_tokens (
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
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  },

  /* ── report_card_remarks — ensure table exists ── */
  {
    label: 'Create report_card_remarks table if not exists',
    sql: `CREATE TABLE IF NOT EXISTS report_card_remarks (
      id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      student_id        VARCHAR(30) NOT NULL,
      term              VARCHAR(30) NOT NULL,
      session           VARCHAR(20) NOT NULL,
      teacher_remark    TEXT,
      principal_remark  TEXT,
      updated_at        DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY        uniq_remark (student_id, term, session)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  },

];

(async () => {
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║  SHC — Parent Portal Migration                          ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  let ok = 0, fail = 0;

  for (const step of steps) {
    try {
      await db.pool.query(step.sql);
      console.log(`  ✅  ${step.label}`);
      ok++;
    } catch (e) {
      // Ignore "can't drop" and "duplicate column" errors — already applied
      const ignorable = e.message.includes("Can't DROP")
        || e.message.includes('Duplicate column')
        || e.message.includes('check that column');
      if (ignorable) {
        console.log(`  ⏭   ${step.label} (already applied)`);
        ok++;
      } else {
        console.error(`  ❌  ${step.label}`);
        console.error(`       ${e.message}`);
        fail++;
      }
    }
  }

  console.log(`\n  Done: ${ok} passed, ${fail} failed`);
  if (fail > 0) {
    console.error('\n  ⚠️  Some steps failed — review errors above.\n');
    process.exit(1);
  } else {
    console.log('\n  🎉  Migration complete!\n');

    console.log('  📋  Next steps:');
    console.log('      1. Add JWT_PARENT_SECRET to your .env (or reuse JWT_ACCESS_SECRET)');
    console.log('      2. Copy middleware/parentAuth.js to your middleware/ folder');
    console.log('      3. Replace routes/students.js, results.js, attendance.js,');
    console.log('         studentFinance.js, accesstoken.js with the updated versions');
    console.log('      4. Replace parent-portal.html with the updated version');
    console.log('      5. Restart the server\n');

    process.exit(0);
  }
})();