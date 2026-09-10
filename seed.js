'use strict';

/**
 * seed.js — Sacred Heart College Eziukwu Aba (SAHARCO)
 * ─────────────────────────────────────────────────────
 * Seeds ONLY essential system data:
 *   - School settings
 *   - Classes & arms
 *   - Core subjects
 *   - Default admin user
 *
 * All demo/sample students, staff, results, attendance,
 * and admissions have been REMOVED.
 *
 * Run:  node seed.js
 * Reset & re-seed:  node seed.js --fresh
 */

require('dotenv').config();
const mysql  = require('mysql2/promise');
const bcrypt = require('bcryptjs');

const SESSION = '2025/2026';
const TERM    = 'Second Term';

const log = (msg) => console.log(`  ✔  ${msg}`);
const hr  = ()    => console.log('─'.repeat(52));

async function main() {
  const pool = mysql.createPool({
    host:            process.env.DB_HOST     || 'auth-db1777.hstgr.io',
    user:            process.env.DB_USER     || 'u156099858_shcaba',
    password:        process.env.DB_PASS     || process.env.DB_PASSWORD || 'SAHARCO1957abadiocese',
    database:        process.env.DB_NAME     || 'u156099858_shcaba_db',
    ssl:             { rejectUnauthorized: false },
    waitForConnections: true,
    connectionLimit: 5,
  });

  const q = (sql, params = []) => pool.query(sql, params);

  console.log('\n╔══════════════════════════════════════════════════╗');
  console.log('║   Sacred Heart College — Database Seed Script   ║');
  console.log('╚══════════════════════════════════════════════════╝');

  const fresh = process.argv.includes('--fresh');

  try {

    /* ── 1. SCHOOL SETTINGS ──────────────────────────────────── */
    hr();
    console.log('  Seeding school settings…');
    const settings = [
      ['school_name',     'Sacred Heart College Eziukwu Aba'],
      ['current_session', SESSION],
      ['current_term',    TERM],
      ['principal_name',  'Rev. Fr. Sullivan Obinna Achilihu'],
      ['school_address',  'Eziukwu Road, Aba, Abia State'],
      ['school_phone',    '08012345678'],
      ['school_email',    'admin@sacredheartcollegeaba.com'],
      ['school_motto',    'Truth and Knowledge'],
    ];
    for (const [k, v] of settings) {
      await q(
        `INSERT INTO school_settings (setting_key, setting_value)
         VALUES (?, ?) ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
        [k, v]
      );
    }
    log('School settings seeded');

    /* ── 2. CLASSES ──────────────────────────────────────────── */
    hr();
    console.log('  Seeding classes…');
    const classData = [
      { name: 'JSS 1', level: 'Junior' },
      { name: 'JSS 2', level: 'Junior' },
      { name: 'JSS 3', level: 'Junior' },
      { name: 'SS 1',  level: 'Senior' },
      { name: 'SS 2',  level: 'Senior' },
      { name: 'SS 3',  level: 'Senior' },
    ];
    const classIds = {};
    for (const cls of classData) {
      await q(
        `INSERT INTO classes (name, level) VALUES (?, ?)
         ON DUPLICATE KEY UPDATE level = VALUES(level)`,
        [cls.name, cls.level]
      );
      const [[row]] = await q('SELECT id FROM classes WHERE name = ?', [cls.name]);
      classIds[cls.name] = row.id;
    }
    log(`${classData.length} classes seeded`);

    /* ── 3. CLASS ARMS ───────────────────────────────────────── */
    hr();
    console.log('  Seeding class arms…');
    const armData = {
      'JSS 1': ['A','B','C'],
      'JSS 2': ['A','B','C'],
      'JSS 3': ['A','B'],
      'SS 1':  ['A','B','C'],
      'SS 2':  ['A','B','C'],
      'SS 3':  ['A','B'],
    };
    let armCount = 0;
    for (const [className, arms] of Object.entries(armData)) {
      const classId = classIds[className];
      for (const arm of arms) {
        await q(
          `INSERT INTO class_arms (class_id, arm) VALUES (?, ?)
           ON DUPLICATE KEY UPDATE arm = arm`,
          [classId, arm]
        );
        armCount++;
      }
    }
    log(`${armCount} class arms seeded`);

    /* ── 4. SUBJECTS ─────────────────────────────────────────── */
    hr();
    console.log('  Seeding subjects…');
    const subjects = [
      { name: 'Mathematics',         code: 'MTH', level: 'All',    type: 'Core' },
      { name: 'English Language',    code: 'ENG', level: 'All',    type: 'Core' },
      { name: 'Biology',             code: 'BIO', level: 'Senior', type: 'Core' },
      { name: 'Chemistry',           code: 'CHE', level: 'Senior', type: 'Core' },
      { name: 'Physics',             code: 'PHY', level: 'Senior', type: 'Core' },
      { name: 'Economics',           code: 'ECO', level: 'Senior', type: 'Elective' },
      { name: 'Government',          code: 'GOV', level: 'Senior', type: 'Elective' },
      { name: 'Literature',          code: 'LIT', level: 'Senior', type: 'Elective' },
      { name: 'Accounting',          code: 'ACC', level: 'Senior', type: 'Elective' },
      { name: 'Geography',           code: 'GEO', level: 'Senior', type: 'Elective' },
      { name: 'CRS / MRS',           code: 'CRS', level: 'All',    type: 'Elective' },
      { name: 'Social Studies',      code: 'SST', level: 'Junior', type: 'Core' },
      { name: 'Basic Technology',    code: 'BTC', level: 'Junior', type: 'Core' },
      { name: 'Agricultural Sci.',   code: 'AGR', level: 'Junior', type: 'Elective' },
      { name: 'Computer Studies',    code: 'CMP', level: 'All',    type: 'Elective' },
      { name: 'French',              code: 'FRN', level: 'All',    type: 'Elective' },
      { name: 'Civic Education',     code: 'CIV', level: 'All',    type: 'Core' },
      { name: 'Fine Arts',           code: 'ART', level: 'All',    type: 'Elective' },
      { name: 'Music',               code: 'MUS', level: 'All',    type: 'Elective' },
      { name: 'Physical Education',  code: 'PHE', level: 'All',    type: 'Elective' },
      { name: 'Home Economics',      code: 'HEC', level: 'Junior', type: 'Elective' },
    ];
    for (const s of subjects) {
      await q(
        `INSERT INTO subjects (name, code, level, type) VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE code = VALUES(code), level = VALUES(level), type = VALUES(type)`,
        [s.name, s.code, s.level, s.type]
      );
    }
    log(`${subjects.length} subjects seeded`);

    /* ── 5. ADMIN USER ───────────────────────────────────────── */
    hr();
    console.log('  Seeding admin user…');
    const adminEmail    = 'admin@sacredheartcollegeaba.com';
    const adminPassword = 'admin1234';
    const hash          = await bcrypt.hash(adminPassword, 10);
    await q(
      `INSERT INTO users (name, email, role, password_hash, active)
       VALUES (?, ?, 'Admin', ?, 1)
       ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash), active = 1`,
      ['SAHARCO Admin', adminEmail, hash]
    );
    log('Admin user seeded');

    /* ── SUMMARY ─────────────────────────────────────────────── */
    hr();
    console.log('\n  📊  SEED SUMMARY');
    hr();
    const [[{ classes: cCount }]]  = await q('SELECT COUNT(*) AS classes  FROM classes');
    const [[{ subjects: sCount }]] = await q('SELECT COUNT(*) AS subjects FROM subjects');
    const [[{ users: uCount }]]    = await q('SELECT COUNT(*) AS users    FROM users');
    console.log(`  Classes   : ${cCount}`);
    console.log(`  Subjects  : ${sCount}`);
    console.log(`  Users     : ${uCount}`);
    hr();
    console.log('\n  🔑  LOGIN CREDENTIALS');
    hr();
    console.log(`  Admin Email    : ${adminEmail}`);
    console.log(`  Admin Password : ${adminPassword}`);
    console.log('\n  ⚠️   Change the password after first login!\n');

  } catch (err) {
    console.error('\n  ❌  Seed error:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
    process.exit(process.exitCode || 0);
  }
}

main();