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
const STUDENTS = {};

/* ─────────────────────────────────────────────────────────────
   USER CREDENTIAL STORE
   ⚠  Replace passwords with bcrypt hashes in production.
───────────────────────────────────────────────────────────── */
const USERS = [];

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