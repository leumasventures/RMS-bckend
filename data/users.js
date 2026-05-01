/* ============================================================
   Sacred Heart College Eziukwu Aba – School Portal
   data/users.js  |  Users, Students & Privileges store
   ============================================================
   Single source of truth for credentials, student registry,
   and role privileges. Imported by:
     • server.js          (login endpoint)
     • middleware/auth.js (session validation)
     • controllers        (child-access guards)

   ⚠  In production replace with DB queries (Mongoose / Sequelize).
      NEVER store plain-text passwords — use bcrypt.hash() and
      bcrypt.compare() instead of direct string comparison.
   ============================================================ */

'use strict';

/* ─────────────────────────────────────────────────────────────
   STUDENT REGISTRY
───────────────────────────────────────────────────────────── */
const STUDENTS = {
  'SHC/001': { name: 'Chidubem Okonkwo', class: 'SS 2',  arm: 'A', gender: 'M' },
  'SHC/002': { name: 'Adaeze Eze',       class: 'SS 1',  arm: 'B', gender: 'F' },
  'SHC/003': { name: 'Emeka Nwosu Jr.',  class: 'JSS 3', arm: 'A', gender: 'M' },
  'SHC/004': { name: 'Chioma Okafor',    class: 'SS 3',  arm: 'A', gender: 'F' },
  'SHC/005': { name: 'Ifeanyi Chukwu',   class: 'JSS 1', arm: 'B', gender: 'M' },
  'SHC/006': { name: 'Ngozi Ani',        class: 'JSS 2', arm: 'A', gender: 'F' },
  'SHC/007': { name: 'Obinna Uche',      class: 'SS 1',  arm: 'A', gender: 'M' },
  'SHC/008': { name: 'Amara Obi',        class: 'JSS 3', arm: 'B', gender: 'F' },
  'SHC/009': { name: 'Kelechi Dike',     class: 'SS 2',  arm: 'B', gender: 'M' },
  'SHC/010': { name: 'Nneka Dike',       class: 'JSS 1', arm: 'A', gender: 'F' },
};

/* ─────────────────────────────────────────────────────────────
   USER CREDENTIAL STORE
   ⚠  Replace passwords with bcrypt hashes in production.
───────────────────────────────────────────────────────────── */
const USERS = [
  /* ── Admin ─────────────────────────────────────────── */
  { username:'admin',    password:'admin',      role:'Admin',   name:'Principal / Admin', email:'admin@shc.edu.ng' },

  /* ── Teachers ──────────────────────────────────────── */
  { username:'enwosu',  password:'teacher123', role:'Teacher', name:'Mr Emeka Nwosu',   email:'enwosu@shc.edu.ng',  teacherId:'T001', assignedClass:'SS 1',   assignedArm:'A' },
  { username:'anze',    password:'teacher123', role:'Teacher', name:'Mrs Adaora Nze',   email:'anze@shc.edu.ng',    teacherId:'T004', assignedClass:'SS 3',   assignedArm:'A' },
  { username:'ngeze',   password:'teacher123', role:'Teacher', name:'Mrs Ngozi Eze',    email:'ngeze@shc.edu.ng',   teacherId:'T002', assignedClass:'JSS 2',  assignedArm:'B' },
  { username:'cobi',    password:'teacher123', role:'Teacher', name:'Mr Chibuike Obi',  email:'cobi@shc.edu.ng',    teacherId:'T003', assignedClass:'SS 2',   assignedArm:'A' },
  { username:'snnaji',  password:'teacher123', role:'Teacher', name:'Mr Samuel Nnaji',  email:'snnaji@shc.edu.ng',  teacherId:'T005', assignedClass:'SS 2',   assignedArm:'B' },
  { username:'iokeke',  password:'teacher123', role:'Teacher', name:'Mrs Ifeoma Okeke', email:'iokeke@shc.edu.ng',  teacherId:'T006', assignedClass:'JSS 1',  assignedArm:'A' },

  /* ── Parents ───────────────────────────────────────── */
  { username:'parent_shc001', password:'5678', role:'Parent', name:'Mrs Okonkwo', studentId:'SHC/001' },
  { username:'parent_shc002', password:'6789', role:'Parent', name:'Mr Eze',      studentId:'SHC/002' },
  { username:'parent_shc003', password:'7890', role:'Parent', name:'Mr Nwosu',    studentId:'SHC/003' },
  { username:'parent_shc004', password:'8901', role:'Parent', name:'Mrs Okafor',  studentId:'SHC/004' },
  { username:'parent_shc005', password:'9012', role:'Parent', name:'Mr Chukwu',   studentId:'SHC/005' },
  { username:'parent_shc006', password:'0123', role:'Parent', name:'Mrs Ani',     studentId:'SHC/006' },
  { username:'parent_shc007', password:'1234', role:'Parent', name:'Mr Uche',     studentId:'SHC/007' },
  { username:'parent_shc008', password:'2345', role:'Parent', name:'Mrs Obi',     studentId:'SHC/008' },
  /* Parent with two children */
  { username:'parent_shc009', password:'3456', role:'Parent', name:'Mr Dike',     studentIds:['SHC/009','SHC/010'] },
];

/* ─────────────────────────────────────────────────────────────
   PRIVILEGE MAP
───────────────────────────────────────────────────────────── */
const PRIVILEGES = {
  Admin: {
    allowedSections:     ['dashboard','classes','arms','students','teachers','subjects','results','report-cards','attendance','fixtures','parent-portal','settings'],
    canEnterResults:     true,
    canTakeAttendance:   true,
    canViewResults:      true,
    canAddRemarks:       true,
    canViewReports:      true,
    canManageStaff:      true,
    canManageStudents:   true,
    canViewParentPortal: true,
    canAccessSettings:   true,
  },
  Teacher: {
    allowedSections:     ['dashboard','students','results','report-cards','attendance','fixtures'],
    canEnterResults:     true,
    canTakeAttendance:   true,
    canViewResults:      true,
    canAddRemarks:       true,
    canViewReports:      true,
    canManageStaff:      false,
    canManageStudents:   false,
    canViewParentPortal: false,
    canAccessSettings:   false,
  },
  Parent: {
    allowedSections:     ['parent-portal'],
    canEnterResults:     false,
    canTakeAttendance:   false,
    canViewResults:      true,
    canAddRemarks:       false,
    canViewReports:      false,
    canManageStaff:      false,
    canManageStudents:   false,
    canViewParentPortal: true,
    canAccessSettings:   false,
  },
};

/* ─────────────────────────────────────────────────────────────
   RESOLVE CHILDREN  (mirrors login.js resolveChildren)
───────────────────────────────────────────────────────────── */
function resolveChildren(user) {
  if (user.role !== 'Parent') return null;
  const ids = user.studentIds
    ? user.studentIds
    : user.studentId ? [user.studentId] : [];
  return ids.map(id => ({
    studentId: id,
    ...(STUDENTS[id] || { name:'Unknown Student', class:'—', arm:'—', gender:'—' }),
  }));
}

module.exports = { USERS, STUDENTS, PRIVILEGES, resolveChildren };