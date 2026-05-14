'use strict';

/**
 * seed.js — Sacred Heart College Eziukwu Aba (SAHARCO)
 * ─────────────────────────────────────────────────────
 * Writes ALL seed data directly to the MySQL database.
 * Replaces both the old in-memory seed.js and seed_admin.js.
 *
 * Run:  node seed.js
 * Reset & re-seed:  node seed.js --fresh
 */

require('dotenv').config();
const mysql  = require('mysql2/promise');
const bcrypt = require('bcryptjs');

const SESSION = '2025/2026';
const TERM    = 'Second Term';
const TODAY   = new Date().toISOString().slice(0, 10);

const log  = (msg) => console.log(`  ✔  ${msg}`);
const hr   = ()    => console.log('─'.repeat(52));
const pad  = (n, len = 3) => String(n).padStart(len, '0');
function rnd(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function pick(arr)      { return arr[Math.floor(Math.random() * arr.length)]; }

async function main() {
  const pool = mysql.createPool({
    host:            process.env.DB_HOST,
    user:            process.env.DB_USER,
    password:        process.env.DB_PASS || process.env.DB_PASSWORD,
    database:        process.env.DB_NAME,
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

    /* ── 1. SCHOOL SETTINGS ─────────────────────────────────── */
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

    /* ── 2. CLASSES ─────────────────────────────────────────── */
    hr();
    console.log('  Seeding classes…');
    if (fresh) await q('DELETE FROM classes');
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

    /* ── 3. CLASS ARMS ──────────────────────────────────────── */
    hr();
    console.log('  Seeding class arms…');
    const armData = {
      'JSS 1': ['A','B','C'], 'JSS 2': ['A','B','C'], 'JSS 3': ['A','B'],
      'SS 1':  ['A','B','C'], 'SS 2':  ['A','B','C'], 'SS 3':  ['A','B'],
    };
    let armCount = 0;
    for (const [cls, arms] of Object.entries(armData)) {
      for (const arm of arms) {
        await q(
          `INSERT INTO class_arms (class_id, arm) VALUES (?, ?)
           ON DUPLICATE KEY UPDATE arm = arm`,
          [classIds[cls], arm]
        );
        armCount++;
      }
    }
    log(`${armCount} arms seeded`);

    /* ── 4. SUBJECTS ────────────────────────────────────────── */
    hr();
    console.log('  Seeding subjects…');
    const subjectData = [
      { name: 'Mathematics',        code: 'MTH', level: 'All',    type: 'Core' },
      { name: 'English Language',   code: 'ENG', level: 'All',    type: 'Core' },
      { name: 'Biology',            code: 'BIO', level: 'Senior', type: 'Core' },
      { name: 'Chemistry',          code: 'CHM', level: 'Senior', type: 'Core' },
      { name: 'Physics',            code: 'PHY', level: 'Senior', type: 'Core' },
      { name: 'Economics',          code: 'ECO', level: 'Senior', type: 'Core' },
      { name: 'Accounting',         code: 'ACC', level: 'Senior', type: 'Elective' },
      { name: 'Government',         code: 'GOV', level: 'Senior', type: 'Elective' },
      { name: 'Literature',         code: 'LIT', level: 'Senior', type: 'Elective' },
      { name: 'Geography',          code: 'GEO', level: 'Senior', type: 'Elective' },
      { name: 'CRS / MRS',          code: 'CRS', level: 'All',    type: 'Core' },
      { name: 'Social Studies',     code: 'SST', level: 'Junior', type: 'Core' },
      { name: 'Basic Technology',   code: 'BTC', level: 'Junior', type: 'Core' },
      { name: 'Agricultural Sci.',  code: 'AGR', level: 'Junior', type: 'Core' },
      { name: 'Computer Studies',   code: 'CST', level: 'All',    type: 'Core' },
      { name: 'French',             code: 'FRN', level: 'Junior', type: 'Elective' },
      { name: 'Civic Education',    code: 'CVE', level: 'All',    type: 'Core' },
      { name: 'Further Maths',      code: 'FMT', level: 'Senior', type: 'Elective' },
    ];
    const subjectIds = {};
    for (const s of subjectData) {
      await q(
        `INSERT INTO subjects (name, code, level, type) VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE code = VALUES(code), level = VALUES(level), type = VALUES(type)`,
        [s.name, s.code, s.level, s.type]
      );
      const [[row]] = await q('SELECT id FROM subjects WHERE name = ?', [s.name]);
      subjectIds[s.name] = row.id;
    }
    log(`${subjectData.length} subjects seeded`);

    /* ── 5. USERS (admin + teachers + parents) ──────────────── */
    hr();
    console.log('  Seeding users…');
    if (fresh) await q('DELETE FROM users');

    const users = [
      { name: 'SAHARCO Admin',       email: 'admin@sacredheartcollegeaba.com', role: 'Admin',   password: 'admin1234',   assigned_class: null, assigned_arm: null },
      { name: 'Mrs Ngozi Eze',       email: 'ngozi@shc.edu.ng',               role: 'Teacher', password: 'Teacher123!', assigned_class: 'SS 1',  assigned_arm: 'A' },
      { name: 'Mr Chidi Okafor',     email: 'chidi@shc.edu.ng',               role: 'Teacher', password: 'Teacher123!', assigned_class: 'JSS 2', assigned_arm: 'B' },
      { name: 'Mrs Adaora Nwosu',    email: 'adaora@shc.edu.ng',              role: 'Teacher', password: 'Teacher123!', assigned_class: 'SS 2',  assigned_arm: 'A' },
      { name: 'Mr Emeka Ibe',        email: 'emeka.ibe@shc.edu.ng',           role: 'Teacher', password: 'Teacher123!', assigned_class: 'JSS 1', assigned_arm: 'A' },
      { name: 'Mrs Chinelo Dike',    email: 'chinelo@shc.edu.ng',             role: 'Teacher', password: 'Teacher123!', assigned_class: 'SS 3',  assigned_arm: 'A' },
      { name: 'Mr Uche Okonkwo',     email: 'uche.parent@gmail.com',          role: 'Parent',  password: 'Parent123!',  assigned_class: null, assigned_arm: null },
      { name: 'Mrs Ifeanyi Nwankwo', email: 'ifeanyi.parent@gmail.com',       role: 'Parent',  password: 'Parent123!',  assigned_class: null, assigned_arm: null },
    ];

    for (const u of users) {
      const hash = await bcrypt.hash(u.password, 10);
      await q(
        `INSERT INTO users (name, email, role, password_hash, assigned_class, assigned_arm, active)
         VALUES (?, ?, ?, ?, ?, ?, 1)
         ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash), active = 1`,
        [u.name, u.email, u.role, hash, u.assigned_class, u.assigned_arm]
      );
    }
    log(`${users.length} users seeded (admin + teachers + parents)`);

    /* ── 6. STAFF ────────────────────────────────────────────── */
    hr();
    console.log('  Seeding staff…');
    if (fresh) await q('DELETE FROM staff');

    const staffData = [
      { id: 'TCH/001', name: 'Mrs Ngozi Eze',      email: 'ngozi@shc.edu.ng',      phone: '08011112222', gender: 'Female', qualification: 'B.Ed Mathematics',        subject: 'Mathematics',     class_name: 'SS 1',  arm: 'A', date_joined: '2018-09-01' },
      { id: 'TCH/002', name: 'Mr Chidi Okafor',    email: 'chidi@shc.edu.ng',      phone: '08022223333', gender: 'Male',   qualification: 'B.Sc English, PGDE',       subject: 'English Language',class_name: 'JSS 2', arm: 'B', date_joined: '2019-01-15' },
      { id: 'TCH/003', name: 'Mrs Adaora Nwosu',   email: 'adaora@shc.edu.ng',     phone: '08033334444', gender: 'Female', qualification: 'B.Sc Biology',             subject: 'Biology',         class_name: 'SS 2',  arm: 'A', date_joined: '2020-09-01' },
      { id: 'TCH/004', name: 'Mr Emeka Ibe',        email: 'emeka.ibe@shc.edu.ng',  phone: '08044445555', gender: 'Male',   qualification: 'B.Ed Chemistry, PGDE',     subject: 'Chemistry',       class_name: 'JSS 1', arm: 'A', date_joined: '2021-09-01' },
      { id: 'TCH/005', name: 'Mrs Chinelo Dike',   email: 'chinelo@shc.edu.ng',    phone: '08055556666', gender: 'Female', qualification: 'B.A Economics',            subject: 'Economics',       class_name: 'SS 3',  arm: 'A', date_joined: '2017-09-01' },
      { id: 'TCH/006', name: 'Mr Obiora Nwachukwu',email: 'obiora@shc.edu.ng',     phone: '08066667777', gender: 'Male',   qualification: 'B.Sc Computer Science',    subject: 'Computer Studies',class_name: null,    arm: null,date_joined: '2022-01-10' },
      { id: 'TCH/007', name: 'Miss Ifeoma Osei',   email: 'ifeoma@shc.edu.ng',     phone: '08077778888', gender: 'Female', qualification: 'B.A French & Linguistics', subject: 'French',          class_name: null,    arm: null,date_joined: '2023-09-01' },
    ];

    for (const s of staffData) {
      const classId = s.class_name ? classIds[s.class_name] : null;
      await q(
        `INSERT INTO staff (id, name, email, phone, gender, qualification, subject, class_id, arm, date_joined, status, category)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Active', 'Academic')
         ON DUPLICATE KEY UPDATE name = VALUES(name), email = VALUES(email)`,
        [s.id, s.name, s.email, s.phone, s.gender, s.qualification, s.subject, classId, s.arm, s.date_joined]
      );
    }
    log(`${staffData.length} staff seeded`);

    /* ── 7. STUDENTS (60 students) ──────────────────────────── */
    hr();
    console.log('  Seeding students…');
    if (fresh) await q('DELETE FROM students');

    const firstNames = {
      Female: ['Adaeze','Chidinma','Blessing','Ngozi','Amara','Chisom','Adaora','Ifeoma','Nneka','Chinwe','Obiageli','Ujunwa','Olachi','Kelechi','Ebele'],
      Male:   ['Chukwuemeka','Ifeanyi','Tochukwu','Obinna','Emeka','Kelechi','Chidi','Uche','Nnamdi','Chibuike','Onyekachi','Ikenna','Ugochukwu','Somto','Ebuka'],
    };
    const lastNames = ['Okonkwo','Eze','Nwosu','Okafor','Chukwu','Ani','Uche','Obi','Nwankwo','Obiora','Anyanwu','Ibe','Dike','Nwachukwu','Osei','Nduka','Orji','Igwe','Mbah','Agu'];
    const streets   = ['Aba Road','Ngwa Street','Pound Road','Factory Road','Eziukwu','Cemetery Road','Okigwe Road','Warehouse Road','Jubilee Road','St Michael Road'];

    const classArms = [
      ...Array(10).fill(null).map((_,i) => ({ cls: 'JSS 1', arm: ['A','A','A','A','B','B','B','C','C','C'][i] })),
      ...Array(10).fill(null).map((_,i) => ({ cls: 'JSS 2', arm: ['A','A','A','B','B','B','B','C','C','C'][i] })),
      ...Array( 8).fill(null).map((_,i) => ({ cls: 'JSS 3', arm: ['A','A','A','A','B','B','B','B'][i]         })),
      ...Array(12).fill(null).map((_,i) => ({ cls: 'SS 1',  arm: ['A','A','A','A','A','B','B','B','C','C','C','C'][i] })),
      ...Array(12).fill(null).map((_,i) => ({ cls: 'SS 2',  arm: ['A','A','A','A','A','B','B','B','C','C','C','C'][i] })),
      ...Array( 8).fill(null).map((_,i) => ({ cls: 'SS 3',  arm: ['A','A','A','A','B','B','B','B'][i]         })),
    ];

    const studentIds = [];
    for (let i = 0; i < classArms.length; i++) {
      const { cls, arm } = classArms[i];
      const gender    = i % 2 === 0 ? 'Female' : 'Male';
      const firstName = firstNames[gender][i % firstNames[gender].length];
      const lastName  = lastNames[i % lastNames.length];
      const dobYear   = cls.startsWith('JSS') ? rnd(2009, 2013) : rnd(2005, 2009);
      const sid       = `SHC/${pad(i + 1)}`;
      const classId   = classIds[cls];

      await q(
        `INSERT INTO students (id, name, class_id, arm, gender, dob, phone, address, attendance, active, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'active')
         ON DUPLICATE KEY UPDATE name = VALUES(name), class_id = VALUES(class_id)`,
        [
          sid, `${firstName} ${lastName}`, classId, arm, gender,
          `${dobYear}-${pad(rnd(1,12),2)}-${pad(rnd(1,28),2)}`,
          `080${rnd(10000000,99999999)}`,
          `${rnd(1,60)} ${pick(streets)}, Aba`,
          rnd(60, 100),
        ]
      );
      studentIds.push({ sid, cls, arm, classId });
    }
    log(`${studentIds.length} students seeded`);

    /* ── 8. RESULTS ─────────────────────────────────────────── */
    hr();
    console.log('  Seeding results…');
    if (fresh) await q('DELETE FROM results');

    const targetGroups = [
      { cls: 'SS 1',  arm: 'A', subjects: ['Mathematics','English Language','Biology','Chemistry','Physics','Economics','Government','Literature','CRS / MRS'] },
      { cls: 'JSS 2', arm: 'B', subjects: ['Mathematics','English Language','Social Studies','Basic Technology','Agricultural Sci.','Computer Studies','French','Civic Education','CRS / MRS'] },
      { cls: 'SS 2',  arm: 'A', subjects: ['Mathematics','English Language','Biology','Chemistry','Physics','Economics','Accounting','Government','Geography'] },
    ];
    const terms = ['First Term', 'Second Term'];
    let resultCount = 0;

    for (const { cls, arm, subjects } of targetGroups) {
      const groupStudents = studentIds.filter(s => s.cls === cls && s.arm === arm);
      for (const term of terms) {
        for (const { sid } of groupStudents) {
          for (const subjectName of subjects) {
            const ca    = rnd(15, 40);
            const exam  = rnd(20, 60);
            await q(
              `INSERT INTO results (student_id, class_id, arm, subject_name, subject_id, term, session, ca, exam)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
               ON DUPLICATE KEY UPDATE ca = VALUES(ca), exam = VALUES(exam)`,
              [sid, classIds[cls], arm, subjectName, subjectIds[subjectName] ?? null, term, SESSION, ca, exam]
            );
            resultCount++;
          }
        }
      }
    }
    log(`${resultCount} result records seeded`);

    /* ── 9. ATTENDANCE ──────────────────────────────────────── */
    hr();
    console.log('  Seeding attendance…');
    if (fresh) await q('DELETE FROM attendance');

    const schoolDays = [];
    const d = new Date();
    while (schoolDays.length < 10) {
      d.setDate(d.getDate() - 1);
      if (d.getDay() !== 0 && d.getDay() !== 6)
        schoolDays.push(new Date(d).toISOString().slice(0, 10));
    }
    schoolDays.reverse();

    const statuses   = ['p','p','p','p','p','p','l','a','e','p'];
    const ss1Students = studentIds.filter(s => s.cls === 'SS 1' && s.arm === 'A');
    let   attCount   = 0;

    for (const date of schoolDays) {
      for (let i = 0; i < ss1Students.length; i++) {
        const { sid, classId } = ss1Students[i];
        await q(
          `INSERT INTO attendance (student_id, class_id, arm, date, term, session, status)
           VALUES (?, ?, 'A', ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE status = VALUES(status)`,
          [sid, classId, date, TERM, SESSION, statuses[(i + attCount) % statuses.length]]
        );
        attCount++;
      }
    }

    const jss2Students = studentIds.filter(s => s.cls === 'JSS 2' && s.arm === 'B');
    for (const date of schoolDays.slice(0, 5)) {
      for (let i = 0; i < jss2Students.length; i++) {
        const { sid, classId } = jss2Students[i];
        await q(
          `INSERT INTO attendance (student_id, class_id, arm, date, term, session, status)
           VALUES (?, ?, 'B', ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE status = VALUES(status)`,
          [sid, classId, date, TERM, SESSION, statuses[i % statuses.length]]
        );
        attCount++;
      }
    }
    log(`${attCount} attendance records seeded`);

    /* ── 10. ADMISSIONS ─────────────────────────────────────── */
    hr();
    console.log('  Seeding admissions…');
    if (fresh) await q('DELETE FROM admissions');

    const applicants = [
      { first_name: 'Chibuike', last_name: 'Onyema',  gender: 'Male',   dob: '2011-04-12', guardian_name: 'Mr Onyema Chibuike',  guardian_phone: '08044445555', guardian_email: 'onyema@gmail.com',       class_apply: 'JSS 1', status: 'Pending',  notes: '' },
      { first_name: 'Adanna',   last_name: 'Obi',     gender: 'Female', dob: '2008-09-20', guardian_name: 'Mrs Obi Adanna',       guardian_phone: '08055556666', guardian_email: 'obi.adanna@gmail.com',    class_apply: 'SS 1',  status: 'Approved', notes: 'Transfer student. Good academic record.' },
      { first_name: 'Kelechi',  last_name: 'Osuji',   gender: 'Male',   dob: '2012-02-18', guardian_name: 'Mr Osuji Kelechi',     guardian_phone: '08066667777', guardian_email: 'osuji@gmail.com',         class_apply: 'JSS 1', status: 'Approved', notes: 'Excellent entrance exam score.' },
      { first_name: 'Olachi',   last_name: 'Mbah',    gender: 'Female', dob: '2009-07-30', guardian_name: 'Mrs Mbah Olachi',      guardian_phone: '08077778888', guardian_email: 'mbah@gmail.com',          class_apply: 'JSS 3', status: 'Pending',  notes: 'Awaiting transfer documents.' },
      { first_name: 'Somto',    last_name: 'Igwe',    gender: 'Male',   dob: '2007-11-05', guardian_name: 'Mr Igwe Somto',        guardian_phone: '08088889999', guardian_email: 'igwe.somto@gmail.com',    class_apply: 'SS 2',  status: 'Rejected', notes: 'Failed entrance assessment.' },
      { first_name: 'Ebele',    last_name: 'Orji',    gender: 'Female', dob: '2006-05-22', guardian_name: 'Mrs Orji Ebele',       guardian_phone: '08099990000', guardian_email: 'orji@gmail.com',          class_apply: 'SS 2',  status: 'Enrolled', notes: 'Top of her previous class.' },
    ];

    for (const a of applicants) {
      await q(
        `INSERT INTO admissions (first_name, last_name, gender, dob, guardian_name, guardian_phone, guardian_email, class_apply, acad_session, entry_term, status, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE status = VALUES(status)`,
        [a.first_name, a.last_name, a.gender, a.dob, a.guardian_name, a.guardian_phone, a.guardian_email, a.class_apply, SESSION, 'First Term', a.status, a.notes]
      );
    }
    log(`${applicants.length} admissions seeded`);

    /* ── 11. NOTICES ────────────────────────────────────────── */
    hr();
    console.log('  Seeding notices…');
    if (fresh) await q('DELETE FROM notices');

    const notices = [
      { title: 'Second Term Resumption', body: `Second term resumes on Monday 13th January ${SESSION.split('/')[1]}. All students are expected to be in school by 8:00 AM.`, audience: 'all', pinned: 1 },
      { title: 'PTA Meeting', body: 'The next PTA meeting will hold on Saturday 25th January. All parents are encouraged to attend.', audience: 'parent', pinned: 0 },
      { title: 'Staff Meeting', body: 'A mandatory staff meeting will hold in the staff room on Friday 17th January at 2:00 PM.', audience: 'teacher', pinned: 0 },
      { title: 'Mid-Term Break', body: 'Mid-term break runs from 10th–14th February. School resumes 17th February.', audience: 'all', pinned: 0 },
    ];

    for (const n of notices) {
      await q(
        `INSERT INTO notices (title, body, audience, pinned) VALUES (?, ?, ?, ?)`,
        [n.title, n.body, n.audience, n.pinned]
      );
    }
    log(`${notices.length} notices seeded`);

    /* ── SUMMARY ────────────────────────────────────────────── */
    hr();
    console.log('\n  📊  SEED SUMMARY');
    hr();
    const [[{ users: uCount }]]    = await q('SELECT COUNT(*) AS users FROM users');
    const [[{ students: sCount }]] = await q('SELECT COUNT(*) AS students FROM students');
    const [[{ staff: stCount }]]   = await q('SELECT COUNT(*) AS staff FROM staff');
    const [[{ results: rCount }]]  = await q('SELECT COUNT(*) AS results FROM results');
    const [[{ att: aCount }]]      = await q('SELECT COUNT(*) AS att FROM attendance');
    console.log(`  Users      : ${uCount}`);
    console.log(`  Staff      : ${stCount}`);
    console.log(`  Students   : ${sCount}`);
    console.log(`  Results    : ${rCount}`);
    console.log(`  Attendance : ${aCount}`);
    hr();
    console.log('\n  🔑  LOGIN CREDENTIALS');
    hr();
    console.log('  Role      Email                                  Password');
    console.log('  ────────  ─────────────────────────────────────  ───────────');
    console.log('  Admin     admin@sacredheartcollegeaba.com         admin1234');
    console.log('  Teacher   ngozi@shc.edu.ng                        Teacher123!');
    console.log('  Teacher   chidi@shc.edu.ng                        Teacher123!');
    console.log('  Parent    uche.parent@gmail.com                   Parent123!');
    hr();
    console.log('\n  ✅  Seed complete!\n');

  } catch (err) {
    console.error('\n  ❌  Seed failed:', err.message);
    console.error(err.stack);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();