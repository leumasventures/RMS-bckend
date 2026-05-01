/**
 * db.js — in-memory data store
 * Swap this out for a real DB (MongoDB / PostgreSQL) later.
 * All collections are plain JS arrays; IDs are auto-incremented.
 */

const bcrypt = require('bcryptjs');

/* ── helpers ─────────────────────────────── */
let _seq = 100;
const nextId = () => ++_seq;

/* ── USERS ───────────────────────────────── */
const users = [
  {
    id: 1,
    name: 'Samuel Admin',
    email: 'admin@shc.edu.ng',
    passwordHash: bcrypt.hashSync('Admin1234!', 10),
    role: 'Admin',
    assignedClass: null,
    assignedArm: null,
  },
  {
    id: 2,
    name: 'Mrs Ngozi Eze',
    email: 'ngozi@shc.edu.ng',
    passwordHash: bcrypt.hashSync('Teacher123!', 10),
    role: 'Teacher',
    assignedClass: 'SS 1',
    assignedArm: 'A',
  },
  {
    id: 3,
    name: 'Mrs Okonkwo',
    email: 'okonkwo.parent@gmail.com',
    passwordHash: bcrypt.hashSync('Parent123!', 10),
    role: 'Parent',
    assignedClass: null,
    assignedArm: null,
    wardId: 'SHC/001',
  },
];

/* ── CLASSES ─────────────────────────────── */
const classes = [
  { id: 1, name: 'JSS 1', level: 'Junior', arms: ['A', 'B', 'C'] },
  { id: 2, name: 'JSS 2', level: 'Junior', arms: ['A', 'B', 'C'] },
  { id: 3, name: 'JSS 3', level: 'Junior', arms: ['A', 'B']      },
  { id: 4, name: 'SS 1',  level: 'Senior', arms: ['A', 'B', 'C'] },
  { id: 5, name: 'SS 2',  level: 'Senior', arms: ['A', 'B', 'C'] },
  { id: 6, name: 'SS 3',  level: 'Senior', arms: ['A', 'B']      },
];

/* ── SUBJECTS ────────────────────────────── */
const subjects = [
  { id: 1,  name: 'Mathematics',       code: 'MTH', level: 'All',    type: 'Core'       },
  { id: 2,  name: 'English Language',  code: 'ENG', level: 'All',    type: 'Core'       },
  { id: 3,  name: 'Biology',           code: 'BIO', level: 'Senior', type: 'Science'    },
  { id: 4,  name: 'Chemistry',         code: 'CHE', level: 'Senior', type: 'Science'    },
  { id: 5,  name: 'Physics',           code: 'PHY', level: 'Senior', type: 'Science'    },
  { id: 6,  name: 'Further Maths',     code: 'FMT', level: 'Senior', type: 'Science'    },
  { id: 7,  name: 'Economics',         code: 'ECO', level: 'Senior', type: 'Commercial' },
  { id: 8,  name: 'Government',        code: 'GOV', level: 'Senior', type: 'Arts'       },
  { id: 9,  name: 'Literature',        code: 'LIT', level: 'Senior', type: 'Arts'       },
  { id: 10, name: 'Civic Education',   code: 'CVE', level: 'All',    type: 'Core'       },
  { id: 11, name: 'Social Studies',    code: 'SST', level: 'Junior', type: 'Core'       },
  { id: 12, name: 'Basic Technology',  code: 'BTH', level: 'Junior', type: 'Vocational' },
  { id: 13, name: 'Agricultural Sci.', code: 'AGR', level: 'All',    type: 'Vocational' },
  { id: 14, name: 'Computer Studies',  code: 'CST', level: 'All',    type: 'Science'    },
  { id: 15, name: 'French',            code: 'FRE', level: 'All',    type: 'Language'   },
  { id: 16, name: 'Fine Art',          code: 'FAT', level: 'All',    type: 'Arts'       },
  { id: 17, name: 'Geography',         code: 'GEO', level: 'Senior', type: 'Arts'       },
  { id: 18, name: 'Accounting',        code: 'ACC', level: 'Senior', type: 'Commercial' },
  { id: 19, name: 'CRS / MRS',         code: 'CRS', level: 'All',    type: 'Core'       },
];

/* ── STUDENTS ────────────────────────────── */
const students = [
  { id: 'SHC/001', name: 'Adaeze Okonkwo',   class: 'SS 1',  arm: 'A', gender: 'Female', attendance: 96 },
  { id: 'SHC/002', name: 'Chukwuemeka Eze',  class: 'SS 1',  arm: 'A', gender: 'Male',   attendance: 82 },
  { id: 'SHC/003', name: 'Blessing Nwosu',   class: 'JSS 2', arm: 'B', gender: 'Female', attendance: 70 },
  { id: 'SHC/004', name: 'Ifeanyi Okafor',   class: 'SS 2',  arm: 'C', gender: 'Male',   attendance: 91 },
  { id: 'SHC/005', name: 'Ngozi Chukwu',     class: 'JSS 1', arm: 'A', gender: 'Female', attendance: 74 },
  { id: 'SHC/006', name: 'Tochukwu Ani',     class: 'SS 3',  arm: 'A', gender: 'Male',   attendance: 98 },
  { id: 'SHC/007', name: 'Chidinma Uche',    class: 'JSS 3', arm: 'B', gender: 'Female', attendance: 88 },
  { id: 'SHC/008', name: 'Obinna Obi',       class: 'SS 2',  arm: 'A', gender: 'Male',   attendance: 63 },
  { id: 'SHC/009', name: 'Amara Eze',        class: 'SS 1',  arm: 'A', gender: 'Female', attendance: 91 },
  { id: 'SHC/010', name: 'Emeka Nwankwo',    class: 'SS 1',  arm: 'A', gender: 'Male',   attendance: 77 },
  { id: 'SHC/011', name: 'Chisom Obiora',    class: 'SS 1',  arm: 'A', gender: 'Female', attendance: 85 },
  { id: 'SHC/012', name: 'Kelechi Anyanwu',  class: 'SS 1',  arm: 'A', gender: 'Male',   attendance: 93 },
];

/* ── RESULTS ─────────────────────────────── */
const results = [];

/* ── PARENT TOKENS ───────────────────────── */
const parentTokens = [];

/* ── DB API ──────────────────────────────── */
module.exports = {
  nextId,

  users,
  classes,
  subjects,
  students,
  results,
  parentTokens,

  /* — user helpers — */
  findUserByEmail: (email) => users.find(u => u.email.toLowerCase() === email.toLowerCase()),
  findUserById:    (id)    => users.find(u => u.id === Number(id)),

  /* — class helpers — */
  findClass:       (name)  => classes.find(c => c.name === name),

  /* — student helpers — */
  findStudent:     (id)    => students.find(s => s.id === id),
  studentsInClass: (cls, arm) =>
    students.filter(s => s.class === cls && (!arm || s.arm === arm)),

  /* — result helpers — */
  findResult: (studentId, subject, term, session) =>
    results.find(r =>
      r.studentId === studentId &&
      r.subject   === subject   &&
      r.term      === term      &&
      r.session   === session
    ),

  upsertResult(entry) {
    const idx = results.findIndex(r =>
      r.studentId === entry.studentId &&
      r.subject   === entry.subject   &&
      r.term      === entry.term      &&
      r.session   === entry.session
    );
    if (idx >= 0) { results[idx] = { ...results[idx], ...entry }; return results[idx]; }
    const newEntry = { id: nextId(), ...entry };
    results.push(newEntry);
    return newEntry;
  },

  countSubjectsForStudent: (studentId, term, session) =>
    new Set(
      results
        .filter(r => r.studentId === studentId && r.term === term && r.session === session)
        .map(r => r.subject)
    ).size,

  /* — parent token helpers — */
  findParentToken: (token) => parentTokens.find(t => t.token === token),
};