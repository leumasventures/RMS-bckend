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