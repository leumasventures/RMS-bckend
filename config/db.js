'use strict';

/**
 * db.js — Sacred Heart College Eziukwu Aba (SAHARCO)
 * In-memory data store with indexed lookups, validation, and audit trails.
 *
 * Swap backing store for MongoDB / PostgreSQL via the adapter layer below:
 * replace the Map/Array primitives with async DB calls — all public methods
 * already return values (not mutate-in-place), making the switch straightforward.
 *
 * Collections:  users | classes | subjects | students | results | parentTokens
 * Indexes:      O(1) lookups by email, studentId, role, and class+arm
 */

const bcrypt = require('bcryptjs');

// ── Types (JSDoc only — swap to TypeScript if desired) ───────────────────────
/**
 * @typedef {{ id: number, name: string, email: string, passwordHash: string,
 *   role: 'Admin'|'Teacher'|'Student'|'Parent',
 *   assignedClass: string|null, assignedArm: string|null,
 *   wardId?: string, active: boolean, createdAt: string, updatedAt: string }} User
 *
 * @typedef {{ id: string, name: string, class: string, arm: string,
 *   gender: 'Male'|'Female', attendance: number,
 *   active: boolean, createdAt: string }} Student
 *
 * @typedef {{ id: number, studentId: string, subject: string,
 *   term: string, session: string,
 *   ca1?: number, ca2?: number, exam?: number, total?: number,
 *   grade?: string, remark?: string,
 *   recordedBy: number, updatedAt: string }} Result
 *
 * @typedef {{ token: string, parentId: number, studentId: string,
 *   expiresAt: string, usedAt?: string }} ParentToken
 */

// ── Constants ─────────────────────────────────────────────────────────────────

const VALID_ROLES    = /** @type {const} */ (['Admin', 'Teacher', 'Student', 'Parent']);
const VALID_TERMS    = /** @type {const} */ (['First', 'Second', 'Third']);
const VALID_GENDERS  = /** @type {const} */ (['Male', 'Female']);
const SALT_ROUNDS    = 10;

/** Nigerian secondary school grading scale */
const GRADE_SCALE = [
  { min: 70, grade: 'A1', remark: 'Excellent'       },
  { min: 65, grade: 'B2', remark: 'Very Good'        },
  { min: 60, grade: 'B3', remark: 'Good'             },
  { min: 55, grade: 'C4', remark: 'Credit'           },
  { min: 50, grade: 'C5', remark: 'Credit'           },
  { min: 45, grade: 'C6', remark: 'Credit'           },
  { min: 40, grade: 'D7', remark: 'Pass'             },
  { min: 35, grade: 'E8', remark: 'Pass'             },
  { min:  0, grade: 'F9', remark: 'Fail'             },
];

// ── Sequence ──────────────────────────────────────────────────────────────────

let _seq = 100;
const nextId = () => ++_seq;

// ── Timestamp helpers ─────────────────────────────────────────────────────────

const now = () => new Date().toISOString();

// ── Validation helpers ────────────────────────────────────────────────────────

class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
  }
}

/**
 * Asserts a score is in [0, max]. Throws ValidationError on failure.
 * @param {number|undefined} value
 * @param {string} field
 * @param {number} max
 */
function assertScore(value, field, max) {
  if (value === undefined || value === null) return; // optional fields allowed
  if (typeof value !== 'number' || isNaN(value))
    throw new ValidationError(`${field} must be a number.`);
  if (value < 0 || value > max)
    throw new ValidationError(`${field} must be between 0 and ${max}.`);
}

/**
 * Derives total, grade, and remark from component scores.
 * CA scores are each out of 20; exam is out of 60 → total out of 100.
 */
function computeScores({ ca1, ca2, exam }) {
  assertScore(ca1,  'CA1',  20);
  assertScore(ca2,  'CA2',  20);
  assertScore(exam, 'Exam', 60);

  if (ca1 == null || ca2 == null || exam == null) return {};   // incomplete

  const total = ca1 + ca2 + exam;
  const { grade, remark } = GRADE_SCALE.find(g => total >= g.min);
  return { total, grade, remark };
}

// ── Indexes ───────────────────────────────────────────────────────────────────
// All indexes are rebuilt from the seed arrays below, then kept in sync
// by every write helper. Direct array mutation is discouraged — use the API.

/** @type {Map<string, User>} email (lowercase) → User */
const userByEmail = new Map();

/** @type {Map<number, User>} id → User */
const userById = new Map();

/** @type {Map<string, Student>} studentId → Student */
const studentById = new Map();

/** @type {Map<string, Student[]>} "class|arm" → Student[] */
const studentsByClassArm = new Map();

/** @type {Map<string, string>} token string → ParentToken.token */
const parentTokenIndex = new Map();

// ── Seed Data ─────────────────────────────────────────────────────────────────

/** @type {User[]} */
const users = [
  {
    id: 1,
    name: 'Saharco Admin',
    email: 'admin@shc.edu.ng',
    passwordHash: bcrypt.hashSync('Admin1234!', SALT_ROUNDS),
    role: 'Admin',
    assignedClass: null,
    assignedArm: null,
    active: true,
    createdAt: '2024-09-01T00:00:00.000Z',
    updatedAt: '2024-09-01T00:00:00.000Z',
  },
  {
    id: 2,
    name: 'Mrs Ngozi Eze',
    email: 'ngozi@shc.edu.ng',
    passwordHash: bcrypt.hashSync('Teacher123!', SALT_ROUNDS),
    role: 'Teacher',
    assignedClass: 'SS 1',
    assignedArm: 'A',
    active: true,
    createdAt: '2024-09-01T00:00:00.000Z',
    updatedAt: '2024-09-01T00:00:00.000Z',
  },
  {
    id: 3,
    name: 'Mrs Okonkwo',
    email: 'okonkwo.parent@gmail.com',
    passwordHash: bcrypt.hashSync('Parent123!', SALT_ROUNDS),
    role: 'Parent',
    assignedClass: null,
    assignedArm: null,
    wardId: 'SHC/001',
    active: true,
    createdAt: '2024-09-01T00:00:00.000Z',
    updatedAt: '2024-09-01T00:00:00.000Z',
  },
];

/** @type {{ id: number, name: string, level: 'Junior'|'Senior', arms: string[] }[]} */
const classes = [
  { id: 1, name: 'JSS 1', level: 'Junior', arms: ['A', 'B', 'C'] },
  { id: 2, name: 'JSS 2', level: 'Junior', arms: ['A', 'B', 'C'] },
  { id: 3, name: 'JSS 3', level: 'Junior', arms: ['A', 'B']      },
  { id: 4, name: 'SS 1',  level: 'Senior', arms: ['A', 'B', 'C'] },
  { id: 5, name: 'SS 2',  level: 'Senior', arms: ['A', 'B', 'C'] },
  { id: 6, name: 'SS 3',  level: 'Senior', arms: ['A', 'B']      },
];

/** @type {{ id: number, name: string, code: string, level: string, type: string }[]} */
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

/** @type {Student[]} */
const students = [
  { id: 'SHC/001', name: 'Adaeze Okonkwo',   class: 'SS 1',  arm: 'A', gender: 'Female', attendance: 96, active: true, createdAt: '2024-09-01T00:00:00.000Z' },
  { id: 'SHC/002', name: 'Chukwuemeka Eze',  class: 'SS 1',  arm: 'A', gender: 'Male',   attendance: 82, active: true, createdAt: '2024-09-01T00:00:00.000Z' },
  { id: 'SHC/003', name: 'Blessing Nwosu',   class: 'JSS 2', arm: 'B', gender: 'Female', attendance: 70, active: true, createdAt: '2024-09-01T00:00:00.000Z' },
  { id: 'SHC/004', name: 'Ifeanyi Okafor',   class: 'SS 2',  arm: 'C', gender: 'Male',   attendance: 91, active: true, createdAt: '2024-09-01T00:00:00.000Z' },
  { id: 'SHC/005', name: 'Ngozi Chukwu',     class: 'JSS 1', arm: 'A', gender: 'Female', attendance: 74, active: true, createdAt: '2024-09-01T00:00:00.000Z' },
  { id: 'SHC/006', name: 'Tochukwu Ani',     class: 'SS 3',  arm: 'A', gender: 'Male',   attendance: 98, active: true, createdAt: '2024-09-01T00:00:00.000Z' },
  { id: 'SHC/007', name: 'Chidinma Uche',    class: 'JSS 3', arm: 'B', gender: 'Female', attendance: 88, active: true, createdAt: '2024-09-01T00:00:00.000Z' },
  { id: 'SHC/008', name: 'Obinna Obi',       class: 'SS 2',  arm: 'A', gender: 'Male',   attendance: 63, active: true, createdAt: '2024-09-01T00:00:00.000Z' },
  { id: 'SHC/009', name: 'Amara Eze',        class: 'SS 1',  arm: 'A', gender: 'Female', attendance: 91, active: true, createdAt: '2024-09-01T00:00:00.000Z' },
  { id: 'SHC/010', name: 'Emeka Nwankwo',    class: 'SS 1',  arm: 'A', gender: 'Male',   attendance: 77, active: true, createdAt: '2024-09-01T00:00:00.000Z' },
  { id: 'SHC/011', name: 'Chisom Obiora',    class: 'SS 1',  arm: 'A', gender: 'Female', attendance: 85, active: true, createdAt: '2024-09-01T00:00:00.000Z' },
  { id: 'SHC/012', name: 'Kelechi Anyanwu',  class: 'SS 1',  arm: 'A', gender: 'Male',   attendance: 93, active: true, createdAt: '2024-09-01T00:00:00.000Z' },
];

/** @type {Result[]} */
const results = [];

/** @type {ParentToken[]} */
const parentTokens = [];

// ── Index Bootstrap ───────────────────────────────────────────────────────────

(function buildIndexes() {
  for (const u of users) {
    userByEmail.set(u.email.toLowerCase(), u);
    userById.set(u.id, u);
  }

  for (const s of students) {
    studentById.set(s.id, s);
    _indexStudentByClassArm(s);
  }

  for (const t of parentTokens) {
    parentTokenIndex.set(t.token, t);
  }
})();

function _indexStudentByClassArm(student) {
  const key = `${student.class}|${student.arm}`;
  if (!studentsByClassArm.has(key)) studentsByClassArm.set(key, []);
  studentsByClassArm.get(key).push(student);
}

// ── User Helpers ──────────────────────────────────────────────────────────────

/**
 * Find an active user by e-mail (case-insensitive).
 * @param {string} email
 * @returns {User|undefined}
 */
function findUserByEmail(email) {
  const u = userByEmail.get(email.toLowerCase());
  return u?.active ? u : undefined;
}

/**
 * Find an active user by numeric ID.
 * @param {number|string} id
 * @returns {User|undefined}
 */
function findUserById(id) {
  const u = userById.get(Number(id));
  return u?.active ? u : undefined;
}

/**
 * Return all active users, optionally filtered by role.
 * @param {'Admin'|'Teacher'|'Student'|'Parent'} [role]
 * @returns {User[]}
 */
function listUsers(role) {
  return users.filter(u => u.active && (!role || u.role === role));
}

/**
 * Create a new user and update indexes.
 * @param {{ name: string, email: string, password: string,
 *   role: string, assignedClass?: string, assignedArm?: string,
 *   wardId?: string }} data
 * @returns {User}
 */
function createUser(data) {
  const { name, email, password, role, assignedClass = null, assignedArm = null, wardId } = data;

  if (!name?.trim())  throw new ValidationError('name is required.');
  if (!email?.trim()) throw new ValidationError('email is required.');
  if (!password)      throw new ValidationError('password is required.');
  if (!VALID_ROLES.includes(role)) throw new ValidationError(`role must be one of: ${VALID_ROLES.join(', ')}.`);
  if (findUserByEmail(email))      throw new ValidationError('A user with that email already exists.');

  const timestamp = now();
  const user = /** @type {User} */ ({
    id:           nextId(),
    name:         name.trim(),
    email:        email.trim().toLowerCase(),
    passwordHash: bcrypt.hashSync(password, SALT_ROUNDS),
    role,
    assignedClass,
    assignedArm,
    ...(wardId ? { wardId } : {}),
    active:    true,
    createdAt: timestamp,
    updatedAt: timestamp,
  });

  users.push(user);
  userByEmail.set(user.email, user);
  userById.set(user.id, user);

  return user;
}

/**
 * Update mutable fields on a user. Returns the updated user.
 * @param {number} id
 * @param {Partial<Pick<User,'name'|'assignedClass'|'assignedArm'|'wardId'|'active'>>} patch
 * @returns {User}
 */
function updateUser(id, patch) {
  const user = findUserById(id);
  if (!user) throw new ValidationError(`User ${id} not found.`);

  const allowed = ['name', 'assignedClass', 'assignedArm', 'wardId', 'active'];
  for (const key of allowed) {
    if (key in patch) user[key] = patch[key];
  }
  user.updatedAt = now();
  return user;
}

/**
 * Soft-delete a user (sets active = false).
 * @param {number} id
 */
function deactivateUser(id) {
  return updateUser(id, { active: false });
}

// ── Class Helpers ─────────────────────────────────────────────────────────────

/**
 * @param {string} name  e.g. 'SS 1'
 */
function findClass(name) {
  return classes.find(c => c.name === name);
}

/**
 * Validate that a class+arm combination exists in the school structure.
 * @param {string} className
 * @param {string} arm
 * @returns {boolean}
 */
function classArmExists(className, arm) {
  const cls = findClass(className);
  return !!cls && cls.arms.includes(arm);
}

// ── Subject Helpers ───────────────────────────────────────────────────────────

function findSubjectByCode(code) {
  return subjects.find(s => s.code === code.toUpperCase());
}

function findSubjectById(id) {
  return subjects.find(s => s.id === Number(id));
}

/**
 * Return subjects applicable to a given class level.
 * @param {'Junior'|'Senior'|'All'} level
 */
function subjectsForLevel(level) {
  return subjects.filter(s => s.level === 'All' || s.level === level);
}

// ── Student Helpers ───────────────────────────────────────────────────────────

/**
 * Find an active student by their admission number.
 * @param {string} id  e.g. 'SHC/001'
 * @returns {Student|undefined}
 */
function findStudent(id) {
  const s = studentById.get(id);
  return s?.active ? s : undefined;
}

/**
 * Return active students in a given class (and optionally arm).
 * @param {string}  className
 * @param {string}  [arm]
 * @returns {Student[]}
 */
function studentsInClass(className, arm) {
  if (arm) {
    return (studentsByClassArm.get(`${className}|${arm}`) ?? []).filter(s => s.active);
  }
  // All arms in the class
  return students.filter(s => s.active && s.class === className);
}

/**
 * Create a new student record.
 * @param {{ id: string, name: string, class: string, arm: string,
 *   gender: 'Male'|'Female', attendance?: number }} data
 * @returns {Student}
 */
function createStudent(data) {
  const { id, name, class: cls, arm, gender, attendance = 0 } = data;

  if (!id?.trim())   throw new ValidationError('Student ID is required.');
  if (!name?.trim()) throw new ValidationError('Student name is required.');
  if (!VALID_GENDERS.includes(gender)) throw new ValidationError('gender must be Male or Female.');
  if (!classArmExists(cls, arm)) throw new ValidationError(`Class "${cls} ${arm}" does not exist.`);
  if (studentById.has(id)) throw new ValidationError(`Student ID ${id} already exists.`);

  const student = /** @type {Student} */ ({
    id:         id.trim(),
    name:       name.trim(),
    class:      cls,
    arm,
    gender,
    attendance: Math.min(100, Math.max(0, attendance)),
    active:     true,
    createdAt:  now(),
  });

  students.push(student);
  studentById.set(student.id, student);
  _indexStudentByClassArm(student);

  return student;
}

/**
 * Update a student's attendance percentage.
 * @param {string} id
 * @param {number} attendance  0–100
 */
function updateAttendance(id, attendance) {
  if (typeof attendance !== 'number' || attendance < 0 || attendance > 100)
    throw new ValidationError('attendance must be a number between 0 and 100.');

  const student = findStudent(id);
  if (!student) throw new ValidationError(`Student ${id} not found.`);

  student.attendance = attendance;
  return student;
}

// ── Result Helpers ────────────────────────────────────────────────────────────

/**
 * Find a single result record.
 * @param {string} studentId
 * @param {string} subject
 * @param {string} term
 * @param {string} session   e.g. '2024/2025'
 * @returns {Result|undefined}
 */
function findResult(studentId, subject, term, session) {
  return results.find(r =>
    r.studentId === studentId &&
    r.subject   === subject   &&
    r.term      === term      &&
    r.session   === session
  );
}

/**
 * Insert or update a result entry.
 * Automatically computes total, grade, and remark if all component scores
 * are present.
 *
 * @param {{ studentId: string, subject: string, term: string, session: string,
 *   ca1?: number, ca2?: number, exam?: number, recordedBy: number }} entry
 * @returns {Result}
 */
function upsertResult(entry) {
  const { studentId, subject, term, session, ca1, ca2, exam, recordedBy } = entry;

  // Validate references
  if (!findStudent(studentId))       throw new ValidationError(`Student ${studentId} not found.`);
  if (!findSubjectByCode(subject) && !subjects.find(s => s.name === subject))
    throw new ValidationError(`Subject "${subject}" not found.`);
  if (!VALID_TERMS.includes(term))   throw new ValidationError(`term must be one of: ${VALID_TERMS.join(', ')}.`);
  if (!session?.match(/^\d{4}\/\d{4}$/))
    throw new ValidationError('session must be in the format "YYYY/YYYY" e.g. "2024/2025".');
  if (!findUserById(recordedBy))     throw new ValidationError(`Recording user ${recordedBy} not found.`);

  const computed = computeScores({ ca1, ca2, exam });
  const timestamp = now();

  const idx = results.findIndex(r =>
    r.studentId === studentId &&
    r.subject   === subject   &&
    r.term      === term      &&
    r.session   === session
  );

  if (idx >= 0) {
    results[idx] = {
      ...results[idx],
      ...(ca1  != null ? { ca1  } : {}),
      ...(ca2  != null ? { ca2  } : {}),
      ...(exam != null ? { exam } : {}),
      ...computed,
      recordedBy,
      updatedAt: timestamp,
    };
    return results[idx];
  }

  const newEntry = /** @type {Result} */ ({
    id: nextId(),
    studentId,
    subject,
    term,
    session,
    ...(ca1  != null ? { ca1  } : {}),
    ...(ca2  != null ? { ca2  } : {}),
    ...(exam != null ? { exam } : {}),
    ...computed,
    recordedBy,
    updatedAt: timestamp,
  });

  results.push(newEntry);
  return newEntry;
}

/**
 * Return all results for a student in a given term/session.
 * @param {string} studentId
 * @param {string} term
 * @param {string} session
 * @returns {Result[]}
 */
function resultsForStudent(studentId, term, session) {
  return results.filter(r =>
    r.studentId === studentId && r.term === term && r.session === session
  );
}

/**
 * Return all results for a class+arm in a given term/session,
 * grouped by studentId.
 * @param {string} className
 * @param {string} arm
 * @param {string} term
 * @param {string} session
 * @returns {Map<string, Result[]>}
 */
function resultsByClass(className, arm, term, session) {
  const classStudents = studentsInClass(className, arm);
  const ids = new Set(classStudents.map(s => s.id));
  const map = new Map();

  for (const r of results) {
    if (ids.has(r.studentId) && r.term === term && r.session === session) {
      if (!map.has(r.studentId)) map.set(r.studentId, []);
      map.get(r.studentId).push(r);
    }
  }

  return map;
}

/**
 * Count the number of distinct subjects recorded for a student
 * in a given term/session.
 * @param {string} studentId
 * @param {string} term
 * @param {string} session
 * @returns {number}
 */
function countSubjectsForStudent(studentId, term, session) {
  return new Set(
    results
      .filter(r => r.studentId === studentId && r.term === term && r.session === session)
      .map(r => r.subject)
  ).size;
}

/**
 * Compute aggregate stats for a student across a term/session.
 * @param {string} studentId
 * @param {string} term
 * @param {string} session
 * @returns {{ totalScore: number, average: number, subjectCount: number,
 *   highestSubject: string|null, lowestSubject: string|null } | null}
 */
function studentTermSummary(studentId, term, session) {
  const records = resultsForStudent(studentId, term, session).filter(r => r.total != null);
  if (!records.length) return null;

  const totalScore   = records.reduce((s, r) => s + r.total, 0);
  const average      = +(totalScore / records.length).toFixed(2);
  const sorted       = [...records].sort((a, b) => b.total - a.total);

  return {
    totalScore,
    average,
    subjectCount:   records.length,
    highestSubject: sorted[0]?.subject ?? null,
    lowestSubject:  sorted[sorted.length - 1]?.subject ?? null,
  };
}

// ── Parent Token Helpers ──────────────────────────────────────────────────────

/**
 * Find a valid (non-expired, non-used) parent access token.
 * @param {string} token
 * @returns {ParentToken|undefined}
 */
function findParentToken(token) {
  const t = parentTokenIndex.get(token);
  if (!t) return undefined;
  if (t.usedAt) return undefined;             // already consumed
  if (new Date(t.expiresAt) < new Date()) return undefined;  // expired
  return t;
}

/**
 * Create a parent access token.
 * @param {{ parentId: number, studentId: string, ttlHours?: number }} opts
 * @returns {ParentToken}
 */
function createParentToken({ parentId, studentId, ttlHours = 48 }) {
  if (!findUserById(parentId))   throw new ValidationError(`Parent user ${parentId} not found.`);
  if (!findStudent(studentId))   throw new ValidationError(`Student ${studentId} not found.`);

  const token     = require('crypto').randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + ttlHours * 3_600_000).toISOString();

  const entry = /** @type {ParentToken} */ ({ token, parentId, studentId, expiresAt });
  parentTokens.push(entry);
  parentTokenIndex.set(token, entry);
  return entry;
}

/**
 * Mark a parent token as used (one-time access pattern).
 * @param {string} token
 */
function consumeParentToken(token) {
  const t = findParentToken(token);
  if (!t) throw new ValidationError('Invalid or expired token.');
  t.usedAt = now();
  return t;
}

// ── Exports ───────────────────────────────────────────────────────────────────

module.exports = {
  // Utilities
  nextId,
  ValidationError,
  GRADE_SCALE,
  VALID_ROLES,
  VALID_TERMS,

  // Raw collections (read-only access — avoid mutating directly)
  users,
  classes,
  subjects,
  students,
  results,
  parentTokens,

  // User API
  findUserByEmail,
  findUserById,
  listUsers,
  createUser,
  updateUser,
  deactivateUser,

  // Class API
  findClass,
  classArmExists,

  // Subject API
  findSubjectByCode,
  findSubjectById,
  subjectsForLevel,

  // Student API
  findStudent,
  studentsInClass,
  createStudent,
  updateAttendance,

  // Result API
  findResult,
  upsertResult,
  resultsForStudent,
  resultsByClass,
  countSubjectsForStudent,
  studentTermSummary,

  // Parent Token API
  findParentToken,
  createParentToken,
  consumeParentToken,
};