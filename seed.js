'use strict';

/**
 * seed.js — Sacred Heart College
 * ─────────────────────────────────────────────────────────────
 * Populates every in-memory collection with realistic data so
 * you can test every API endpoint immediately after boot.
 *
 * Run:  node seed.js
 *
 * NOTE: Because db.js uses in-memory arrays (not a real DB),
 *       this script prints a summary and a sample token to stdout.
 *       When you switch to MySQL/Postgres, replace the array
 *       mutations below with INSERT queries or ORM calls.
 * ─────────────────────────────────────────────────────────────
 */

require('dotenv').config();
const bcrypt = require('bcryptjs');
const db     = require('./db');

/* ═══════════════════════════════════════════
   HELPERS
═══════════════════════════════════════════ */
const log  = (msg)        => console.log(`  ✔  ${msg}`);
const warn = (msg)        => console.log(`  ⚠  ${msg}`);
const hr   = ()           => console.log('─'.repeat(52));
const pad  = (n, len = 3) => String(n).padStart(len, '0');

function rnd(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function pick(arr)      { return arr[Math.floor(Math.random() * arr.length)]; }
function isoDate(d)     { return d.toISOString().slice(0, 10); }

const TODAY    = isoDate(new Date());
const SESSION  = '2025/2026';
const TERM     = 'Second Term';

/* ═══════════════════════════════════════════
   1. CLEAR ALL MUTABLE COLLECTIONS
      (static refs like classes/subjects stay)
═══════════════════════════════════════════ */
function clearCollections() {
  hr();
  console.log('  Clearing existing mutable data…');

  // Keep first 3 seed users (admin, teacher, parent) but remove rest
  db.users.splice(3);
  db.students.splice(0);
  db.teachers.splice(0);
  db.admissions.splice(0);
  db.attendance.splice(0);
  db.reForms.splice(0);
  db.results.splice(0);
  db.parentTokens.splice(0);

  log('Collections cleared');
}

/* ═══════════════════════════════════════════
   2. USERS
═══════════════════════════════════════════ */
function seedUsers() {
  hr();
  console.log('  Seeding users…');

  const extraUsers = [
    { name: 'Mr Chidi Okafor',   email: 'chidi@shc.edu.ng',          role: 'Teacher', password: 'Teacher123!', assignedClass: 'JSS 2', assignedArm: 'B' },
    { name: 'Mrs Adaora Nwosu',  email: 'adaora@shc.edu.ng',          role: 'Teacher', password: 'Teacher123!', assignedClass: 'SS 2',  assignedArm: 'A' },
    { name: 'Mr Emeka Ibe',      email: 'emeka.ibe@shc.edu.ng',        role: 'Teacher', password: 'Teacher123!', assignedClass: 'JSS 1', assignedArm: 'A' },
    { name: 'Mrs Chinelo Dike',  email: 'chinelo@shc.edu.ng',          role: 'Teacher', password: 'Teacher123!', assignedClass: 'SS 3',  assignedArm: 'A' },
    { name: 'Mr Uche Parent',    email: 'uche.parent@gmail.com',       role: 'Parent',  password: 'Parent123!',  wardId: 'SHC/002' },
    { name: 'Mrs Ifeanyi Parent',email: 'ifeanyi.parent@gmail.com',    role: 'Parent',  password: 'Parent123!',  wardId: 'SHC/004' },
  ];

  extraUsers.forEach((u, i) => {
    db.users.push({
      id:            db.users.length + 1,
      name:          u.name,
      email:         u.email,
      passwordHash:  bcrypt.hashSync(u.password, 10),
      role:          u.role,
      assignedClass: u.assignedClass || null,
      assignedArm:   u.assignedArm   || null,
      ...(u.wardId ? { wardId: u.wardId } : {}),
    });
  });

  log(`${db.users.length} users total (${db.users.filter(u => u.role === 'Teacher').length} teachers, ${db.users.filter(u => u.role === 'Parent').length} parents, 1 admin)`);
}

/* ═══════════════════════════════════════════
   3. TEACHERS
═══════════════════════════════════════════ */
function seedTeachers() {
  hr();
  console.log('  Seeding teachers…');

  const teachers = [
    {
      id: 'TCH/001', name: 'Mrs Ngozi Eze',     email: 'ngozi@shc.edu.ng',
      phone: '08011112222', gender: 'Female', qualification: 'B.Ed Mathematics',
      subjects: ['Mathematics', 'Further Maths'],
      assignedClass: 'SS 1', assignedArm: 'A',
      isFormTeacher: true, formClass: 'SS 1', formArm: 'A',
      employmentDate: '2018-09-01', status: 'Active',
    },
    {
      id: 'TCH/002', name: 'Mr Chidi Okafor',   email: 'chidi@shc.edu.ng',
      phone: '08022223333', gender: 'Male', qualification: 'B.Sc English, PGDE',
      subjects: ['English Language', 'Literature'],
      assignedClass: 'JSS 2', assignedArm: 'B',
      isFormTeacher: true, formClass: 'JSS 2', formArm: 'B',
      employmentDate: '2019-01-15', status: 'Active',
    },
    {
      id: 'TCH/003', name: 'Mrs Adaora Nwosu',  email: 'adaora@shc.edu.ng',
      phone: '08033334444', gender: 'Female', qualification: 'B.Sc Biology',
      subjects: ['Biology', 'Agricultural Sci.'],
      assignedClass: 'SS 2', assignedArm: 'A',
      isFormTeacher: true, formClass: 'SS 2', formArm: 'A',
      employmentDate: '2020-09-01', status: 'Active',
    },
    {
      id: 'TCH/004', name: 'Mr Emeka Ibe',       email: 'emeka.ibe@shc.edu.ng',
      phone: '08044445555', gender: 'Male', qualification: 'B.Ed Chemistry, PGDE',
      subjects: ['Chemistry', 'Physics'],
      assignedClass: 'JSS 1', assignedArm: 'A',
      isFormTeacher: true, formClass: 'JSS 1', formArm: 'A',
      employmentDate: '2021-09-01', status: 'Active',
    },
    {
      id: 'TCH/005', name: 'Mrs Chinelo Dike',   email: 'chinelo@shc.edu.ng',
      phone: '08055556666', gender: 'Female', qualification: 'B.A Economics',
      subjects: ['Economics', 'Accounting', 'Government'],
      assignedClass: 'SS 3', assignedArm: 'A',
      isFormTeacher: true, formClass: 'SS 3', formArm: 'A',
      employmentDate: '2017-09-01', status: 'Active',
    },
    {
      id: 'TCH/006', name: 'Mr Obiora Nwachukwu', email: 'obiora@shc.edu.ng',
      phone: '08066667777', gender: 'Male', qualification: 'B.Sc Computer Science',
      subjects: ['Computer Studies', 'Basic Technology'],
      assignedClass: null, assignedArm: null,
      isFormTeacher: false, formClass: null, formArm: null,
      employmentDate: '2022-01-10', status: 'Active',
    },
    {
      id: 'TCH/007', name: 'Miss Ifeoma Osei',   email: 'ifeoma@shc.edu.ng',
      phone: '08077778888', gender: 'Female', qualification: 'B.A French & Linguistics',
      subjects: ['French', 'Civic Education', 'CRS / MRS'],
      assignedClass: null, assignedArm: null,
      isFormTeacher: false, formClass: null, formArm: null,
      employmentDate: '2023-09-01', status: 'Active',
    },
  ];

  teachers.forEach(t => db.teachers.push(t));
  log(`${db.teachers.length} teachers seeded`);
}

/* ═══════════════════════════════════════════
   4. STUDENTS  (60 students across all classes)
═══════════════════════════════════════════ */
function seedStudents() {
  hr();
  console.log('  Seeding students…');

  const firstNames = {
    Female: ['Adaeze','Chidinma','Blessing','Ngozi','Amara','Chisom','Adaora','Ifeoma','Nneka','Chinwe','Obiageli','Ujunwa','Olachi','Kelechi','Ebele'],
    Male:   ['Chukwuemeka','Ifeanyi','Tochukwu','Obinna','Emeka','Kelechi','Chidi','Uche','Nnamdi','Chibuike','Onyekachi','Ikenna','Ugochukwu','Somto','Ebuka'],
  };
  const lastNames = ['Okonkwo','Eze','Nwosu','Okafor','Chukwu','Ani','Uche','Obi','Nwankwo','Obiora','Anyanwu','Ibe','Dike','Nwachukwu','Osei','Nduka','Orji','Igwe','Mbah','Agu'];
  const streets   = ['Aba Road','Ngwa Street','Pound Road','Factory Road','Eziukwu','Cemetery Road','Okigwe Road','Warehouse Road','Jubilee Road','St Michael Road','Umuola Road','Aba-Owerri Rd','Mission Hill','Port Harcourt Rd','Ikot Ekpene Rd'];

  // class/arm distribution — 10 students per class, spread across arms
  const classArms = [
    ...Array(10).fill(null).map((_,i) => ({ cls: 'JSS 1', arm: ['A','A','A','A','B','B','B','C','C','C'][i] })),
    ...Array(10).fill(null).map((_,i) => ({ cls: 'JSS 2', arm: ['A','A','A','B','B','B','B','C','C','C'][i] })),
    ...Array( 8).fill(null).map((_,i) => ({ cls: 'JSS 3', arm: ['A','A','A','A','B','B','B','B'][i]         })),
    ...Array(12).fill(null).map((_,i) => ({ cls: 'SS 1',  arm: ['A','A','A','A','A','B','B','B','C','C','C','C'][i] })),
    ...Array(12).fill(null).map((_,i) => ({ cls: 'SS 2',  arm: ['A','A','A','A','A','B','B','B','C','C','C','C'][i] })),
    ...Array( 8).fill(null).map((_,i) => ({ cls: 'SS 3',  arm: ['A','A','A','A','B','B','B','B'][i]         })),
  ];

  classArms.forEach(({ cls, arm }, i) => {
    const gender    = i % 2 === 0 ? 'Female' : 'Male';
    const firstName = firstNames[gender][i % firstNames[gender].length];
    const lastName  = lastNames[i % lastNames.length];
    const dobYear   = cls.startsWith('JSS') ? rnd(2009, 2013) : rnd(2005, 2009);
    const studentId = `SHC/${pad(i + 1)}`;

    db.students.push({
      id:          studentId,
      name:        `${firstName} ${lastName}`,
      class:       cls,
      arm,
      gender,
      dob:         `${dobYear}-${pad(rnd(1,12),2)}-${pad(rnd(1,28),2)}`,
      parentPhone: `080${rnd(10000000, 99999999)}`,
      address:     `${rnd(1, 60)} ${pick(streets)}, Aba`,
      attendance:  rnd(60, 100),
    });
  });

  log(`${db.students.length} students seeded across ${db.classes.length} classes`);
}

/* ═══════════════════════════════════════════
   5. RESULTS  (realistic scores for SS 1 A & JSS 2 B, two terms)
═══════════════════════════════════════════ */
function seedResults() {
  hr();
  console.log('  Seeding results…');

  function gradeOf(total) {
    if (total >= 70) return { letter: 'A', remark: 'Excellent' };
    if (total >= 60) return { letter: 'B', remark: 'Very Good' };
    if (total >= 50) return { letter: 'C', remark: 'Good'      };
    if (total >= 45) return { letter: 'D', remark: 'Pass'      };
    if (total >= 40) return { letter: 'E', remark: 'Weak Pass' };
    return                   { letter: 'F', remark: 'Fail'     };
  }

  const targetGroups = [
    { cls: 'SS 1',  arm: 'A', subjects: ['Mathematics','English Language','Biology','Chemistry','Physics','Economics','Government','Literature','CRS / MRS'] },
    { cls: 'JSS 2', arm: 'B', subjects: ['Mathematics','English Language','Social Studies','Basic Technology','Agricultural Sci.','Computer Studies','French','Civic Education','CRS / MRS'] },
    { cls: 'SS 2',  arm: 'A', subjects: ['Mathematics','English Language','Biology','Chemistry','Physics','Economics','Accounting','Government','Geography'] },
  ];

  const terms = ['First Term', 'Second Term'];

  let count = 0;
  targetGroups.forEach(({ cls, arm, subjects }) => {
    const students = db.students.filter(s => s.class === cls && s.arm === arm);
    terms.forEach(term => {
      students.forEach(student => {
        subjects.forEach(subject => {
          const ca   = rnd(15, 40);
          const exam = rnd(20, 60);
          const total = Math.min(ca + exam, 100);
          db.results.push({
            id:        db.nextId(),
            studentId: student.id,
            class:     cls,
            arm,
            subject,
            term,
            session:   SESSION,
            ca,
            exam,
            total,
            ...gradeOf(total),
          });
          count++;
        });
      });
    });
  });

  log(`${count} result records seeded`);
}

/* ═══════════════════════════════════════════
   6. ATTENDANCE  (last 10 school days for SS 1 A)
═══════════════════════════════════════════ */
function seedAttendance() {
  hr();
  console.log('  Seeding attendance…');

  // Generate last 10 weekdays
  const schoolDays = [];
  const d = new Date();
  while (schoolDays.length < 10) {
    d.setDate(d.getDate() - 1);
    if (d.getDay() !== 0 && d.getDay() !== 6) schoolDays.push(isoDate(new Date(d)));
  }
  schoolDays.reverse(); // oldest first

  const targetStudents = db.students.filter(s => s.class === 'SS 1' && s.arm === 'A');
  const statuses       = ['Present','Present','Present','Present','Present','Present','Late','Absent','Excused','Present'];
  let   count          = 0;

  schoolDays.forEach(date => {
    targetStudents.forEach((student, i) => {
      const status = statuses[(i + count) % statuses.length];
      db.attendance.push({
        id:        db.nextId(),
        studentId: student.id,
        class:     'SS 1',
        arm:       'A',
        date,
        term:      TERM,
        session:   SESSION,
        status,
        markedBy:  'TCH/001',
        remarks:   status === 'Absent' ? 'No prior notice' : status === 'Late' ? 'Arrived 10 mins late' : '',
      });
      count++;
    });
  });

  // Also seed 5 days for JSS 2 B
  const jssStudents = db.students.filter(s => s.class === 'JSS 2' && s.arm === 'B');
  schoolDays.slice(0, 5).forEach(date => {
    jssStudents.forEach((student, i) => {
      db.attendance.push({
        id:        db.nextId(),
        studentId: student.id,
        class:     'JSS 2',
        arm:       'B',
        date,
        term:      TERM,
        session:   SESSION,
        status:    statuses[i % statuses.length],
        markedBy:  'TCH/002',
        remarks:   '',
      });
    });
  });

  // Update student.attendance % from records
  db.students.forEach(student => {
    const records = db.attendance.filter(a => a.studentId === student.id);
    if (!records.length) return;
    const present = records.filter(a => ['Present','Late'].includes(a.status)).length;
    student.attendance = parseFloat((present / records.length * 100).toFixed(1));
  });

  log(`${db.attendance.length} attendance records seeded`);
}

/* ═══════════════════════════════════════════
   7. ADMISSIONS
═══════════════════════════════════════════ */
function seedAdmissions() {
  hr();
  console.log('  Seeding admissions…');

  const applicants = [
    { name: 'Chibuike Onyema',  dob: '2011-04-12', gender: 'Male',   pName: 'Mr Onyema Chibuike',  phone: '08044445555', email: 'onyema@gmail.com',       addr: '10 Aba Road, Aba',       cls: 'JSS 1', prev: 'Community Primary School Aba',         status: 'Pending',  aCls: null,   aArm: null, admAt: null,         notes: '' },
    { name: 'Adanna Obi',       dob: '2008-09-20', gender: 'Female', pName: 'Mrs Obi Adanna',       phone: '08055556666', email: 'obi.adanna@gmail.com',    addr: '7 Eziukwu Road, Aba',    cls: 'SS 1',  prev: 'Govt Secondary School Aba',            status: 'Approved', aCls: 'SS 1', aArm: 'B',  admAt: '2025-12-10', notes: 'Transfer student. Good academic record.' },
    { name: 'Kelechi Osuji',    dob: '2012-02-18', gender: 'Male',   pName: 'Mr Osuji Kelechi',     phone: '08066667777', email: 'osuji@gmail.com',         addr: '44 Ngwa Road, Aba',      cls: 'JSS 1', prev: 'Sacred Heart Primary School',          status: 'Approved', aCls: 'JSS 1',aArm: 'C',  admAt: '2026-01-05', notes: 'Excellent entrance exam score.' },
    { name: 'Olachi Mbah',      dob: '2009-07-30', gender: 'Female', pName: 'Mrs Mbah Olachi',      phone: '08077778888', email: 'mbah@gmail.com',          addr: '3 Factory Road, Aba',    cls: 'JSS 3', prev: 'St Francis Secondary School',          status: 'Pending',  aCls: null,   aArm: null, admAt: null,         notes: 'Awaiting transfer documents.' },
    { name: 'Somto Igwe',       dob: '2007-11-05', gender: 'Male',   pName: 'Mr Igwe Somto',        phone: '08088889999', email: 'igwe.somto@gmail.com',    addr: '88 Port Harcourt Rd, Aba',cls: 'SS 2',  prev: 'Community Secondary School',           status: 'Rejected', aCls: null,   aArm: null, admAt: null,         notes: 'Failed entrance assessment.' },
    { name: 'Ebele Orji',       dob: '2006-05-22', gender: 'Female', pName: 'Mrs Orji Ebele',       phone: '08099990000', email: 'orji@gmail.com',          addr: '12 Ikot Ekpene Rd, Aba', cls: 'SS 2',  prev: 'Federal Government College Port Harcourt',status: 'Enrolled',aCls: 'SS 2', aArm: 'B',  admAt: '2026-01-10', notes: 'Top of her previous class.' },
  ];

  applicants.forEach((a, i) => {
    const year = SESSION.split('/')[1];
    db.admissions.push({
      id:                db.nextId(),
      applicationNo:     `ADM/${year}/${pad(i + 1)}`,
      applicantName:     a.name,
      dob:               a.dob,
      gender:            a.gender,
      parentName:        a.pName,
      parentPhone:       a.phone,
      parentEmail:       a.email,
      address:           a.addr,
      applyingForClass:  a.cls,
      previousSchool:    a.prev,
      session:           SESSION,
      status:            a.status,
      appliedAt:         '2025-11-' + pad(rnd(1, 28), 2),
      admittedAt:        a.admAt,
      assignedStudentId: a.status === 'Enrolled' ? `SHC/${pad(db.students.length + i + 1)}` : null,
      assignedClass:     a.aCls,
      assignedArm:       a.aArm,
      notes:             a.notes,
    });
  });

  log(`${db.admissions.length} admission records seeded (${db.admissions.filter(a=>a.status==='Pending').length} pending, ${db.admissions.filter(a=>a.status==='Approved').length} approved, ${db.admissions.filter(a=>a.status==='Enrolled').length} enrolled, ${db.admissions.filter(a=>a.status==='Rejected').length} rejected)`);
}

/* ═══════════════════════════════════════════
   8. RE-REGISTRATION FORMS
═══════════════════════════════════════════ */
function seedReForms() {
  hr();
  console.log('  Seeding re-registration forms…');

  // Grab some students to use
  const ss3Students  = db.students.filter(s => s.class === 'SS 3').slice(0, 4);
  const ss2Students  = db.students.filter(s => s.class === 'SS 2').slice(0, 3);
  const jss3Students = db.students.filter(s => s.class === 'JSS 3').slice(0, 2);
  const jss1Student  = db.students.filter(s => s.class === 'JSS 1')[0];

  const forms = [
    // SS 3 students re-registering for final year
    ...ss3Students.map((s, i) => ({
      studentId:   s.id,
      type:        'ReRegistration',
      fromClass:   'SS 3', fromArm: s.arm,
      toClass:     'SS 3', toArm:   s.arm,
      fromSession: '2024/2025', toSession: SESSION,
      term:        'First Term',
      status:      i < 3 ? 'Approved' : 'Pending',
      initiatedBy: 1, approvedBy: i < 3 ? 1 : null,
      initiatedAt: '2025-09-01',
      approvedAt:  i < 3 ? '2025-09-03' : null,
      notes:       i < 3 ? 'Annual re-registration confirmed.' : 'Awaiting parent payment.',
    })),
    // SS 2 → SS 3 promotions
    ...ss2Students.map((s, i) => ({
      studentId:   s.id,
      type:        'Promotion',
      fromClass:   'SS 2', fromArm: s.arm,
      toClass:     'SS 3', toArm:   s.arm,
      fromSession: '2024/2025', toSession: SESSION,
      term:        'First Term',
      status:      'Approved',
      initiatedBy: 1, approvedBy: 1,
      initiatedAt: '2025-09-01',
      approvedAt:  '2025-09-02',
      notes:       'Promoted based on cumulative results.',
    })),
    // JSS 3 → JSS 3 re-reg (one approved, one pending)
    ...jss3Students.map((s, i) => ({
      studentId:   s.id,
      type:        'ReRegistration',
      fromClass:   'JSS 3', fromArm: s.arm,
      toClass:     'JSS 3', toArm:   s.arm,
      fromSession: '2024/2025', toSession: SESSION,
      term:        'First Term',
      status:      i === 0 ? 'Approved' : 'Pending',
      initiatedBy: 1, approvedBy: i === 0 ? 1 : null,
      initiatedAt: '2025-09-01',
      approvedAt:  i === 0 ? '2025-09-04' : null,
      notes:       '',
    })),
    // Demotion example
    {
      studentId:   ss2Students[0]?.id || db.students[0].id,
      type:        'Demotion',
      fromClass:   'SS 3', fromArm: 'A',
      toClass:     'SS 2', toArm:   'A',
      fromSession: '2024/2025', toSession: SESSION,
      term:        'First Term',
      status:      'Approved',
      initiatedBy: 1, approvedBy: 1,
      initiatedAt: '2025-09-05',
      approvedAt:  '2025-09-07',
      notes:       'Poor performance in SS 3 trial exams.',
    },
    // Transfer out example
    {
      studentId:   jss1Student?.id || db.students[0].id,
      type:        'TransferOut',
      fromClass:   jss1Student?.class || 'JSS 1', fromArm: jss1Student?.arm || 'A',
      toClass:     jss1Student?.class || 'JSS 1', toArm:   jss1Student?.arm || 'A',
      fromSession: SESSION, toSession: SESSION,
      term:        TERM,
      status:      'Pending',
      initiatedBy: 1, approvedBy: null,
      initiatedAt: TODAY,
      approvedAt:  null,
      notes:       'Family relocating to Lagos.',
    },
  ];

  forms.forEach((f, i) => {
    const prefix = { ReRegistration:'REG', Promotion:'PRO', Demotion:'DEM', TransferOut:'TRO', TransferIn:'TRI' }[f.type] || 'REF';
    const year   = SESSION.split('/')[1];
    db.reForms.push({
      id:  db.nextId(),
      refNo: `${prefix}/${year}/${pad(i + 1)}`,
      ...f,
    });
  });

  log(`${db.reForms.length} re-form records seeded`);
}

/* ═══════════════════════════════════════════
   9. PARENT TOKENS  (report-card access tokens)
═══════════════════════════════════════════ */
function seedParentTokens() {
  hr();
  console.log('  Seeding parent tokens…');

  const ss1AStudents = db.students.filter(s => s.class === 'SS 1' && s.arm === 'A').slice(0, 5);

  ss1AStudents.forEach((student, i) => {
    const token = `SHC-PRC-${SESSION.replace('/','-')}-${pad(student.id.split('/')[1], 6)}`;
    db.parentTokens.push({
      token,
      studentId: student.id,
      session:   SESSION,
      term:      TERM,
      createdAt: TODAY,
      expiresAt: `${parseInt(SESSION.split('/')[1]) + 1}-03-31`,
    });
  });

  log(`${db.parentTokens.length} parent tokens seeded`);
}

/* ═══════════════════════════════════════════
   10. SUMMARY
═══════════════════════════════════════════ */
function printSummary() {
  hr();
  console.log('\n  📊  SEED SUMMARY');
  hr();
  console.log(`  Users        : ${db.users.length}`);
  console.log(`  Teachers     : ${db.teachers.length}`);
  console.log(`  Students     : ${db.students.length}`);
  console.log(`  Results      : ${db.results.length}`);
  console.log(`  Attendance   : ${db.attendance.length}`);
  console.log(`  Admissions   : ${db.admissions.length}`);
  console.log(`  Re-Forms     : ${db.reForms.length}`);
  console.log(`  Parent Tokens: ${db.parentTokens.length}`);
  hr();

  console.log('\n  🔑  TEST CREDENTIALS');
  hr();
  console.log('  Role      Email                         Password');
  console.log('  ────────  ────────────────────────────  ────────────');
  console.log('  Admin     admin@shc.edu.ng              Admin1234!');
  console.log('  Teacher   ngozi@shc.edu.ng              Teacher123!');
  console.log('  Teacher   chidi@shc.edu.ng              Teacher123!');
  console.log('  Parent    okonkwo.parent@gmail.com      Parent123!');
  hr();

  if (db.parentTokens.length) {
    console.log('\n  🎫  SAMPLE PARENT REPORT CARD TOKEN');
    hr();
    console.log(`  Student  : ${db.students.find(s => s.id === db.parentTokens[0].studentId)?.name}`);
    console.log(`  Token    : ${db.parentTokens[0].token}`);
    console.log(`  Use at   : GET /api/results/report-card/${db.parentTokens[0].studentId}`);
    hr();
  }

  console.log('\n  ✅  Seed complete. Run: npm run dev\n');
}

/* ═══════════════════════════════════════════
   MAIN
═══════════════════════════════════════════ */
function seed() {
  console.log('\n╔══════════════════════════════════════════════════╗');
  console.log('║   Sacred Heart College — Database Seed Script   ║');
  console.log('╚══════════════════════════════════════════════════╝');

  try {
    clearCollections();
    seedUsers();
    seedTeachers();
    seedStudents();
    seedResults();
    seedAttendance();
    seedAdmissions();
    seedReForms();
    seedParentTokens();
    printSummary();
    process.exit(0);
  } catch (err) {
    console.error('\n  ❌  Seed failed:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

seed();