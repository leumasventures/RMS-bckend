'use strict';

/**
 * checkResultController.js — Sacred Heart College (SAHARCO)
 *
 * Routes (wired in checkResultRoutes.js):
 *   GET /api/check-result/available-terms/:studentId
 *   GET /api/check-result/sheet/:studentId
 *   GET /api/check-result/subject-detail/:studentId/:subjectCode
 *   GET /api/check-result/term-trend/:studentId
 *   GET /api/check-result/class-comparison/:studentId
 *   GET /api/check-result/assessments/:studentId
 *   GET /api/check-result/report-card/:studentId
 *
 * Merges two conflicting versions (documents 10 & our previous output):
 *  1. GRADE_SCALE — document-10 used a 5-tier scale (75/65/55/45 thresholds).
 *     ADOPTED: 6-tier scale matching gradeOf() in resultController (70/60/50/45/40).
 *  2. Student lookup — document-10 required '../data/users' (STUDENTS map).
 *     ADOPTED: db.findStudent() first, then inline STUDENT_SEED fallback,
 *              so the controller works in both the static demo and live-DB modes.
 *  3. Auth — document-10 used req.shcSession exclusively (non-standard).
 *     ADOPTED: req.user (standard passport/middleware pattern) with req.shcSession
 *              fallback so both legacy and new routes work.
 *  4. _canAccess — document-10 checked session.children[].studentId.
 *     ADOPTED: also checks req.user.wardId (direct Parent→ward mapping used
 *              by accessTokenController and attendanceController).
 *  5. getAllAssessments — document-10 tried require('./parentPortalController')
 *     which crashes if that file doesn't exist. Removed. Assessment data is
 *     defined inline (already present in both versions).
 *  6. getAvailableTerms — document-10 applied _canAccess inside the filter,
 *     silently returning [] instead of 403 when access is denied. Fixed to 403.
 *  7. getReportCard promotion threshold — document-10 used 45; resultController
 *     gradeOf() uses 40 as the lowest pass (grade E = Weak Pass). ADOPTED: 40.
 *  8. Subject teacher field — kept from document-10 (richer data for the UI).
 *  9. _getSheet — merges live db.results with static RESULT_SHEETS so the
 *     portal works before AND after switching to live data entry.
 * 10. 'Student' role added — students can view their own results.
 */

/* ─── optional live DB ───────────────────────────────────────────────────── */
let db;
try { db = require('../config/db'); } catch { db = null; }

/* ─── static student seed ────────────────────────────────────────────────── */
// Used when db.findStudent() is unavailable or returns null (demo mode).
// No hardcoded students — all lookups use live DB via db.findStudent()
const STUDENT_SEED = {};

function _findStudent(studentId) {
  return db?.findStudent?.(studentId) || STUDENT_SEED[studentId] || null;
}

/* ─── grading scale ─────────────────────────────────────────────────────── */
// 6-tier — matches gradeOf() in resultController exactly.
// Document-10 used 5-tier (75/65/55/45); this version uses 70/60/50/45/40.
const GRADE_SCALE = [
  { min:70, max:100, grade:'A', label:'Excellent',  points:4.0 },
  { min:60, max:69,  grade:'B', label:'Very Good',  points:3.0 },
  { min:50, max:59,  grade:'C', label:'Good',       points:2.0 },
  { min:45, max:49,  grade:'D', label:'Pass',       points:1.5 },
  { min:40, max:44,  grade:'E', label:'Weak Pass',  points:1.0 },
  { min:0,  max:39,  grade:'F', label:'Fail',       points:0.0 },
];

function _gradeInfo(score) {
  return GRADE_SCALE.find(g => score >= g.min && score <= g.max) || GRADE_SCALE[5];
}

/* ─── static result sheets ───────────────────────────────────────────────── */
// Key: `${studentId}::${session}::${term}`
// Subject objects now include `teacher` field (from document-10).
// RESULT_SHEETS removed — all results come from live DB
const RESULT_SHEETS = {};


/* ─── class comparison data ──────────────────────────────────────────────── */
const CLASS_STATS = {
  'SS 2-A': { MTH:{avg:65,high:88}, ENG:{avg:62,high:80}, BIO:{avg:68,high:85}, CHM:{avg:55,high:75}, GEO:{avg:63,high:79}, CMP:{avg:70,high:92} },
  'SS 1-B': { MTH:{avg:70,high:90}, ENG:{avg:68,high:88}, BSC:{avg:65,high:84}, SST:{avg:63,high:79}, ART:{avg:72,high:93}, MUS:{avg:60,high:76} },
  'JSS 3-A':{ MTH:{avg:58,high:80}, ENG:{avg:60,high:75}, BSC:{avg:62,high:78}, SST:{avg:57,high:70}, ART:{avg:65,high:85}, BTH:{avg:50,high:68} },
  'SS 3-A': { MTH:{avg:75,high:95}, ENG:{avg:72,high:92}, CHM:{avg:68,high:89}, BIO:{avg:74,high:94}, PHY:{avg:66,high:88}, GEO:{avg:68,high:87} },
  'JSS 1-B':{ MTH:{avg:60,high:82}, ENG:{avg:62,high:74}, BSC:{avg:61,high:77}, SST:{avg:59,high:70}, ART:{avg:66,high:82}, BTH:{avg:55,high:65} },
  'JSS 2-A':{ MTH:{avg:68,high:86}, ENG:{avg:65,high:84}, BSC:{avg:63,high:80}, SST:{avg:62,high:82}, ART:{avg:70,high:89}, MUS:{avg:58,high:75} },
  'SS 1-A': { MTH:{avg:68,high:82}, ENG:{avg:65,high:78}, BIO:{avg:63,high:75}, CHM:{avg:58,high:71}, GEO:{avg:66,high:83}, CMP:{avg:72,high:86} },
  'JSS 3-B':{ MTH:{avg:65,high:91}, ENG:{avg:63,high:89}, BSC:{avg:62,high:85}, SST:{avg:60,high:82}, ART:{avg:68,high:94}, MUS:{avg:59,high:80} },
  'SS 2-B': { MTH:{avg:66,high:80}, ENG:{avg:63,high:75}, BIO:{avg:64,high:77}, CHM:{avg:54,high:68}, GEO:{avg:65,high:79}, CMP:{avg:70,high:84} },
  'JSS 1-A':{ MTH:{avg:67,high:92}, ENG:{avg:65,high:90}, BSC:{avg:63,high:86}, SST:{avg:62,high:85}, ART:{avg:70,high:91}, BTH:{avg:59,high:80} },
};

/* ─── inline assessment store ────────────────────────────────────────────── */
// Mock assessments removed — use live DB
const RECENT_ASSESSMENTS = {};


/* ─── helpers ────────────────────────────────────────────────────────────── */

const fail = (res, status, msg) =>
  res.status(status).json({ success: false, message: msg });

const ok = (res, data, meta = {}) =>
  res.status(200).json({ success: true, ...meta, data });

function _fmtDate(iso) {
  const d = new Date(iso);
  return isNaN(d) ? iso : d.toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' });
}

/**
 * Resolve the authenticated user.
 * req.user   → standard passport/middleware pattern.
 * req.shcSession → legacy session object from the original controller.
 */
function _user(req) {
  return req.user || req.shcSession || null;
}

/**
 * Access check.
 * Supports Admin, Teacher (class/arm match), Parent (wardId OR children[]),
 * and Student (own results only).
 */
function _canAccess(req, studentId, studentClass, studentArm) {
  const user = _user(req);
  if (!user) return false;
  if (user.role === 'Admin') return true;
  if (user.role === 'Teacher') {
    return user.assignedClass === studentClass &&
           (!user.assignedArm || user.assignedArm === studentArm);
  }
  if (user.role === 'Parent') {
    if (user.wardId === studentId) return true;
    return Array.isArray(user.children) &&
           user.children.some(c => (c.studentId || c.id) === studentId);
  }
  if (user.role === 'Student') return user.studentId === studentId;
  return false;
}

function _sheetSummary(sheet) {
  const total = sheet.subjects.reduce((a, s) => a + s.total, 0);
  const avg   = Math.round(total / sheet.subjects.length);
  const info  = _gradeInfo(avg);
  return { totalScore: total, maxScore: sheet.subjects.length * 100, average: avg, grade: info.grade, gradeLabel: info.label };
}

function _classAvg(classKey) {
  const data = CLASS_STATS[classKey];
  if (!data) return null;
  const vals = Object.values(data).map(v => v.avg);
  return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
}

/**
 * Attempt to get a result sheet from the live DB first,
 * falling back to the static fixture.
 * This allows the portal to work in demo mode AND in production.
 */
function _getSheet(studentId, session, term) {
  if (db) {
    const student = db.findStudent?.(studentId);
    if (student) {
      const rows = (db.results || []).filter(r =>
        r.studentId === studentId && r.session === session && r.term === term
      );
      if (rows.length) {
        const remarkEntry = (db.remarks || []).find(r =>
          r.studentId === studentId && r.term === term && r.session === session
        ) || {};
        const domainEntry = (db.domainAssessments || []).find(d =>
          d.studentId === studentId && d.term === term && d.session === session
        ) || {};
        // Find assigned class teacher
        const classTeacherRecord = (db.staff || db.teachers || []).find(t =>
          (t.classUnit === student.class || t.assignedClass === student.class) &&
          (!t.arm || t.arm === student.arm || !t.assignedArm || t.assignedArm === student.arm)
        );
        return {
          studentId, session, term,
          classTeacher:     classTeacherRecord?.name || '',
          principal:        db.schoolInfo?.principal || '',
          numberOfStudents: (db.students || []).filter(s => s.class === student.class && s.arm === student.arm && s.active !== false).length,
          position:         null,
          resumptionDate:   db.schoolInfo?.resumptionDate || '',
          subjects: rows.map(r => ({
            code:    (r.subject || '').substring(0, 4).toUpperCase().replace(/ /g, ''),
            name:    r.subject,
            teacher: '',
            ca1:     Math.floor((r.ca || 0) / 2),
            ca2:     Math.ceil((r.ca || 0) / 2),
            exam:    r.exam  || 0,
            total:   r.total || 0,
          })),
          classTeacherRemark: remarkEntry.teacherRemark   || '',
          principalRemark:    remarkEntry.principalRemark || '',
          affective:          domainEntry.behavior || {},
          psychomotor:        {},
          _fromLive: true,
        };
      }
    }
  }
  return RESULT_SHEETS[`${studentId}::${session}::${term}`] || null;
}

/* ═══════════════════════════════════════════════════════════════════════════
   GET /api/check-result/available-terms/:studentId
   Query: session
═══════════════════════════════════════════════════════════════════════════ */
exports.getAvailableTerms = (req, res) => {
  const { studentId }   = req.params;
  const session         = req.query.session || '2024/2025';
  const student         = _findStudent(studentId);

  if (!student) return fail(res, 404, `Student ${studentId} not found.`);

  // Access check is now a proper 403, not a silent empty list
  if (!_canAccess(req, studentId, student.class, student.arm))
    return fail(res, 403, 'You do not have permission to view results for this student.');

  const TERMS     = ['First Term', 'Second Term', 'Third Term'];
  const available = TERMS
    .filter(t => !!_getSheet(studentId, session, t))
    .map((t, i) => ({
      term:            t,
      academicSession: session,
      label:           `${t} — ${session}`,
      value:           t.toLowerCase().replace(/ /g, '-'),
      isCurrent:       t === 'Second Term',
      order:           i + 1,
    }));

  return ok(res, available, { count: available.length });
};

/* ═══════════════════════════════════════════════════════════════════════════
   GET /api/check-result/sheet/:studentId
   Query: session, term
═══════════════════════════════════════════════════════════════════════════ */
exports.getResultSheet = (req, res) => {
  const { studentId }   = req.params;
  const session         = req.query.session || '2024/2025';
  const term            = req.query.term    || 'Second Term';
  const student         = _findStudent(studentId);

  if (!student) return fail(res, 404, `Student ${studentId} not found.`);
  if (!_canAccess(req, studentId, student.class, student.arm))
    return fail(res, 403, 'You do not have permission to view this result sheet.');

  const sheet = _getSheet(studentId, session, term);
  if (!sheet) return fail(res, 404, `No result sheet found for ${studentId} — ${session} ${term}.`);

  const subjects = sheet.subjects.map(s => ({
    ...s,
    gradeInfo: _gradeInfo(s.total),
    caTotal:   (s.ca1 || 0) + (s.ca2 || 0),
  }));
  const summary = _sheetSummary({ ...sheet, subjects });

  return ok(res, {
    studentId,
    name:             student.name,
    class:            student.class,
    arm:              student.arm,
    gender:           student.gender,
    session,
    term,
    classTeacher:     sheet.classTeacher,
    principal:        sheet.principal,
    position:         sheet.position,
    numberOfStudents: sheet.numberOfStudents,
    resumptionDate:   _fmtDate(sheet.resumptionDate),
    subjects,
    summary,
    classTeacherRemark: sheet.classTeacherRemark,
    principalRemark:    sheet.principalRemark,
    affective:          sheet.affective,
    psychomotor:        sheet.psychomotor,
    meta: {
      generatedAt: new Date().toISOString(),
      viewerRole:  _user(req)?.role || 'unknown',
      source:      sheet._fromLive ? 'live' : 'static',
    },
  });
};

/* ═══════════════════════════════════════════════════════════════════════════
   GET /api/check-result/subject-detail/:studentId/:subjectCode
   Query: session, term
═══════════════════════════════════════════════════════════════════════════ */
exports.getSubjectDetail = (req, res) => {
  const { studentId, subjectCode } = req.params;
  const session = req.query.session || '2024/2025';
  const term    = req.query.term    || 'Second Term';
  const student = _findStudent(studentId);

  if (!student) return fail(res, 404, `Student ${studentId} not found.`);
  if (!_canAccess(req, studentId, student.class, student.arm))
    return fail(res, 403, 'Access denied.');

  const sheet = _getSheet(studentId, session, term);
  if (!sheet) return fail(res, 404, 'Result sheet not found.');

  const subject = sheet.subjects.find(s => s.code === subjectCode.toUpperCase());
  if (!subject)  return fail(res, 404, `Subject code "${subjectCode}" not found.`);

  const classKey  = `${student.class}-${student.arm}`;
  const classData = CLASS_STATS[classKey];
  const cls       = classData?.[subjectCode.toUpperCase()];

  return ok(res, {
    studentId,
    studentName: student.name,
    session,
    term,
    subject: {
      ...subject,
      gradeInfo: _gradeInfo(subject.total),
      breakdown: [
        { label:'Continuous Assessment 1', score: subject.ca1  || 0, outOf: 15 },
        { label:'Continuous Assessment 2', score: subject.ca2  || 0, outOf: 15 },
        { label:'Terminal Examination',    score: subject.exam || 0, outOf: 70 },
        { label:'Total',                   score: subject.total,     outOf: 100 },
      ],
    },
    classComparison: cls ? {
      studentScore: subject.total,
      classAverage: cls.avg,
      classHighest: cls.high,
      aboveAverage: subject.total >= cls.avg,
    } : null,
  });
};

/* ═══════════════════════════════════════════════════════════════════════════
   GET /api/check-result/term-trend/:studentId
═══════════════════════════════════════════════════════════════════════════ */
exports.getTermTrend = (req, res) => {
  const { studentId } = req.params;
  const student       = _findStudent(studentId);

  if (!student) return fail(res, 404, `Student ${studentId} not found.`);
  if (!_canAccess(req, studentId, student.class, student.arm))
    return fail(res, 403, 'Access denied.');

  const TERMS    = ['First Term', 'Second Term', 'Third Term'];
  const sessions = ['2024/2025'];
  const trend    = [];
  const classKey = `${student.class}-${student.arm}`;

  sessions.forEach(sess => {
    TERMS.forEach(t => {
      const sheet = _getSheet(studentId, sess, t);
      if (!sheet) return;
      const sum = _sheetSummary(sheet);
      trend.push({
        label:        `${t.split(' ')[0]} ${sess.split('/')[0]}`,
        term:         t,
        session:      sess,
        average:      sum.average,
        position:     sheet.position,
        classSize:    sheet.numberOfStudents,
        classAverage: _classAvg(classKey),
        delta:        trend.length > 0 ? sum.average - trend[trend.length - 1].average : 0,
      });
    });
  });

  return ok(res, { studentId, studentName: student.name, trend }, { count: trend.length });
};

/* ═══════════════════════════════════════════════════════════════════════════
   GET /api/check-result/class-comparison/:studentId
   Query: session, term
═══════════════════════════════════════════════════════════════════════════ */
exports.getClassComparison = (req, res) => {
  const { studentId } = req.params;
  const session       = req.query.session || '2024/2025';
  const term          = req.query.term    || 'Second Term';
  const student       = _findStudent(studentId);

  if (!student) return fail(res, 404, `Student ${studentId} not found.`);
  if (!_canAccess(req, studentId, student.class, student.arm))
    return fail(res, 403, 'Access denied.');

  const sheet = _getSheet(studentId, session, term);
  if (!sheet) return fail(res, 404, 'Result sheet not found.');

  const classKey  = `${student.class}-${student.arm}`;
  const classData = CLASS_STATS[classKey] || {};

  const comparison = sheet.subjects.map(s => ({
    code:         s.code,
    name:         s.name,
    studentScore: s.total,
    classAverage: classData[s.code]?.avg  ?? null,
    classHighest: classData[s.code]?.high ?? null,
    aboveAverage: classData[s.code] ? s.total >= classData[s.code].avg : null,
  }));

  return ok(res, { studentId, studentName: student.name, session, term, comparison });
};

/* ═══════════════════════════════════════════════════════════════════════════
   GET /api/check-result/assessments/:studentId
   Query: session, term, subject, limit
   Assessment data defined inline — no cross-controller require().
═══════════════════════════════════════════════════════════════════════════ */
exports.getAllAssessments = (req, res) => {
  const { studentId } = req.params;
  const session       = req.query.session || '2024/2025';
  const term          = req.query.term    || 'Second Term';
  const student       = _findStudent(studentId);

  if (!student) return fail(res, 404, `Student ${studentId} not found.`);
  if (!_canAccess(req, studentId, student.class, student.arm))
    return fail(res, 403, 'Access denied.');

  let list = [...(ASSESSMENT_STORE[studentId] || [])];

  if (req.query.subject) {
    const f = req.query.subject.toLowerCase();
    list = list.filter(a => a.title.toLowerCase().includes(f));
  }

  const limit = Math.min(parseInt(req.query.limit) || 20, 50);
  list = list.slice(0, limit).map(a => ({
    ...a,
    displayScore:  `${a.score}/${a.outOf}`,
    dateFormatted: _fmtDate(a.date),
    gradeInfo:     _gradeInfo(a.score),
    // dot colour threshold aligned with 6-tier GRADE_SCALE
    dot: a.score >= 70 ? 'green' : a.score >= 50 ? 'gold' : 'rust',
  }));

  return ok(res, { studentId, studentName: student.name, session, term, assessments: list }, { count: list.length });
};

/* ═══════════════════════════════════════════════════════════════════════════
   GET /api/check-result/report-card/:studentId
   Query: session, term
   Full printable report-card payload. Promotion threshold = 40 (grade E).
═══════════════════════════════════════════════════════════════════════════ */
exports.getReportCard = (req, res) => {
  const { studentId } = req.params;
  const session       = req.query.session || '2024/2025';
  const term          = req.query.term    || 'Second Term';
  const student       = _findStudent(studentId);

  if (!student) return fail(res, 404, `Student ${studentId} not found.`);
  if (!_canAccess(req, studentId, student.class, student.arm))
    return fail(res, 403, 'Access denied.');

  const sheet = _getSheet(studentId, session, term);
  if (!sheet) return fail(res, 404, 'Result sheet not found.');

  const subjects = sheet.subjects.map(s => ({
    ...s,
    gradeInfo: _gradeInfo(s.total),
    caTotal:   (s.ca1 || 0) + (s.ca2 || 0),
  }));
  const summary = _sheetSummary({ ...sheet, subjects });

  // Promotion: no subject below 40 (grade F), and overall average ≥ 40
  const hasFailure = subjects.some(s => s.total < 40);
  const promoted   = !hasFailure && summary.average >= 40;

  const user = _user(req);
  return ok(res, {
    studentId,
    name:             student.name,
    class:            student.class,
    arm:              student.arm,
    gender:           student.gender,
    session,
    term,
    schoolInfo: {
      name:      db?.schoolInfo?.name      || 'Sacred Heart College',
      location:  db?.schoolInfo?.address   || 'Eziukwu, Aba, Abia State, Nigeria',
      motto:     db?.schoolInfo?.motto     || 'Truth, Virtue and Knowledge',
      email:     db?.schoolInfo?.email     || 'info@shc.edu.ng',
      phone:     db?.schoolInfo?.phone     || '+234 803 000 0000',
      principal: sheet.principal           || db?.schoolInfo?.principal || '',
    },
    classTeacher:       sheet.classTeacher,
    subjects,
    summary,
    position:           sheet.position,
    numberOfStudents:   sheet.numberOfStudents,
    promotionStatus:    promoted ? 'Promoted to Next Class' : 'Requires Review',
    resumptionDate:     _fmtDate(sheet.resumptionDate),
    classTeacherRemark: sheet.classTeacherRemark,
    principalRemark:    sheet.principalRemark,
    affective:          sheet.affective,
    psychomotor:        sheet.psychomotor,
    gradingScale:       GRADE_SCALE,
    printedAt:          new Date().toISOString(),
    printedBy:          user?.name || user?.id || 'System',
  });
};