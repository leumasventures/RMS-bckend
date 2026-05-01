/* ============================================================
   Sacred Heart College Eziukwu Aba – School Portal
   controllers/checkResultController.js
   ============================================================
   Express controller for every /api/check-result/* route.

   Methods exported:
     getAvailableTerms     GET /api/check-result/available-terms/:studentId
     getResultSheet        GET /api/check-result/sheet/:studentId
     getSubjectDetail      GET /api/check-result/subject-detail/:studentId/:subjectCode
     getTermTrend          GET /api/check-result/term-trend/:studentId
     getClassComparison    GET /api/check-result/class-comparison/:studentId
     getAllAssessments      GET /api/check-result/assessments/:studentId
     getReportCard         GET /api/check-result/report-card/:studentId
   ============================================================ */

'use strict';

const { STUDENTS } = require('../data/users');

/* ─────────────────────────────────────────────────────────────
   GRADING SCALE  (Nigerian secondary school standard)
───────────────────────────────────────────────────────────── */
const GRADE_SCALE = [
  { min:75, max:100, grade:'A', label:'Distinction',  points:4.0 },
  { min:65, max:74,  grade:'B', label:'Credit',       points:3.0 },
  { min:55, max:64,  grade:'C', label:'Merit',        points:2.0 },
  { min:45, max:54,  grade:'D', label:'Pass',         points:1.0 },
  { min:0,  max:44,  grade:'F', label:'Fail',         points:0.0 },
];

function _gradeInfo(score) {
  return GRADE_SCALE.find(g => score >= g.min && score <= g.max) || GRADE_SCALE[4];
}

/* ─────────────────────────────────────────────────────────────
   RESULT SHEETS
   Key: `${studentId}::${session}::${term}`
───────────────────────────────────────────────────────────── */
const RESULT_SHEETS = {

  /* ── SHC/001 ── */
  'SHC/001::2024/2025::First Term': {
    studentId:'SHC/001', session:'2024/2025', term:'First Term',
    classTeacher:'Mr Emeka Nwosu', principal:'Rev. Fr. Augustine Eze',
    numberOfStudents:40, position:14, resumptionDate:'2025-01-13',
    subjects:[
      { code:'MTH', name:'Mathematics',      teacher:'Mr Emeka Nwosu',   ca1:13, ca2:12, exam:46, total:71, grade:'B' },
      { code:'ENG', name:'English Language', teacher:'Mrs Ngozi Eze',    ca1:11, ca2:12, exam:45, total:68, grade:'C' },
      { code:'BIO', name:'Biology',          teacher:'Mrs Ifeoma Okeke', ca1:14, ca2:14, exam:48, total:76, grade:'B' },
      { code:'CHM', name:'Chemistry',        teacher:'Dr Chibuike Obi',  ca1:9,  ca2:9,  exam:40, total:58, grade:'C' },
      { code:'GEO', name:'Geography',        teacher:'Mr Samuel Nnaji',  ca1:12, ca2:12, exam:46, total:70, grade:'B' },
      { code:'CMP', name:'Computer Studies', teacher:'Mrs Adaora Nze',   ca1:16, ca2:15, exam:52, total:83, grade:'A' },
    ],
    classTeacherRemark:'He has made a fair start. Consistency is key going forward.',
    principalRemark:'A decent first term. There is room for improvement.',
    affective:{ punctuality:'Good', neatness:'Good', politeness:'Very Good', cooperation:'Good', attentiveness:'Fair' },
    psychomotor:{ drawing:'Good', sports:'Very Good', handwriting:'Fair' },
  },
  'SHC/001::2024/2025::Second Term': {
    studentId:'SHC/001', session:'2024/2025', term:'Second Term',
    classTeacher:'Mr Emeka Nwosu', principal:'Rev. Fr. Augustine Eze',
    numberOfStudents:40, position:12, resumptionDate:'2025-04-28',
    subjects:[
      { code:'MTH', name:'Mathematics',      teacher:'Mr Emeka Nwosu',   ca1:14, ca2:14, exam:50, total:78, grade:'B' },
      { code:'ENG', name:'English Language', teacher:'Mrs Ngozi Eze',    ca1:12, ca2:13, exam:47, total:72, grade:'B' },
      { code:'BIO', name:'Biology',          teacher:'Mrs Ifeoma Okeke', ca1:15, ca2:15, exam:50, total:80, grade:'A' },
      { code:'CHM', name:'Chemistry',        teacher:'Dr Chibuike Obi',  ca1:10, ca2:10, exam:45, total:65, grade:'C' },
      { code:'GEO', name:'Geography',        teacher:'Mr Samuel Nnaji',  ca1:13, ca2:13, exam:48, total:74, grade:'B' },
      { code:'CMP', name:'Computer Studies', teacher:'Mrs Adaora Nze',   ca1:17, ca2:16, exam:55, total:88, grade:'A' },
    ],
    classTeacherRemark:'Chidubem shows good potential. He needs to dedicate more time to Chemistry.',
    principalRemark:'A satisfactory performance. Keep striving for excellence.',
    affective:{ punctuality:'Very Good', neatness:'Good', politeness:'Excellent', cooperation:'Good', attentiveness:'Good' },
    psychomotor:{ drawing:'Good', sports:'Very Good', handwriting:'Good' },
  },

  /* ── SHC/002 ── */
  'SHC/002::2024/2025::First Term': {
    studentId:'SHC/002', session:'2024/2025', term:'First Term',
    classTeacher:'Mrs Ngozi Eze', principal:'Rev. Fr. Augustine Eze',
    numberOfStudents:38, position:5, resumptionDate:'2025-01-13',
    subjects:[
      { code:'MTH', name:'Mathematics',      teacher:'Mr Emeka Nwosu',   ca1:15, ca2:16, exam:50, total:81, grade:'A' },
      { code:'ENG', name:'English Language', teacher:'Mrs Ngozi Eze',    ca1:14, ca2:14, exam:52, total:80, grade:'A' },
      { code:'BSC', name:'Basic Science',    teacher:'Mrs Ifeoma Okeke', ca1:13, ca2:13, exam:48, total:74, grade:'B' },
      { code:'SST', name:'Social Studies',   teacher:'Mr Samuel Nnaji',  ca1:12, ca2:12, exam:46, total:70, grade:'B' },
      { code:'ART', name:'Fine Arts',        teacher:'Mr Chibuike Obi',  ca1:16, ca2:16, exam:54, total:86, grade:'A' },
      { code:'MUS', name:'Music',            teacher:'Mrs Adaora Nze',   ca1:11, ca2:12, exam:46, total:69, grade:'C' },
    ],
    classTeacherRemark:'Adaeze has made an excellent start. She shows strength in all subjects.',
    principalRemark:'Very impressive first term. Continue to work hard.',
    affective:{ punctuality:'Excellent', neatness:'Excellent', politeness:'Excellent', cooperation:'Very Good', attentiveness:'Excellent' },
    psychomotor:{ drawing:'Excellent', sports:'Good', handwriting:'Excellent' },
  },
  'SHC/002::2024/2025::Second Term': {
    studentId:'SHC/002', session:'2024/2025', term:'Second Term',
    classTeacher:'Mrs Ngozi Eze', principal:'Rev. Fr. Augustine Eze',
    numberOfStudents:38, position:3, resumptionDate:'2025-04-28',
    subjects:[
      { code:'MTH', name:'Mathematics',      teacher:'Mr Emeka Nwosu',   ca1:17, ca2:16, exam:57, total:90, grade:'A' },
      { code:'ENG', name:'English Language', teacher:'Mrs Ngozi Eze',    ca1:16, ca2:16, exam:56, total:88, grade:'A' },
      { code:'BSC', name:'Basic Science',    teacher:'Mrs Ifeoma Okeke', ca1:15, ca2:15, exam:54, total:84, grade:'A' },
      { code:'SST', name:'Social Studies',   teacher:'Mr Samuel Nnaji',  ca1:13, ca2:14, exam:52, total:79, grade:'B' },
      { code:'ART', name:'Fine Arts',        teacher:'Mr Chibuike Obi',  ca1:17, ca2:18, exam:58, total:93, grade:'A' },
      { code:'MUS', name:'Music',            teacher:'Mrs Adaora Nze',   ca1:12, ca2:13, exam:51, total:76, grade:'B' },
    ],
    classTeacherRemark:'Adaeze is a highly motivated student who excels in virtually every subject.',
    principalRemark:'An outstanding performance. Continue to aim for the top.',
    affective:{ punctuality:'Excellent', neatness:'Excellent', politeness:'Excellent', cooperation:'Excellent', attentiveness:'Excellent' },
    psychomotor:{ drawing:'Excellent', sports:'Good', handwriting:'Excellent' },
  },

  /* ── SHC/003 ── */
  'SHC/003::2024/2025::Second Term': {
    studentId:'SHC/003', session:'2024/2025', term:'Second Term',
    classTeacher:'Mrs Ifeoma Okeke', principal:'Rev. Fr. Augustine Eze',
    numberOfStudents:35, position:21, resumptionDate:'2025-04-28',
    subjects:[
      { code:'MTH', name:'Mathematics',      teacher:'Mr Emeka Nwosu',   ca1:10, ca2:10, exam:44, total:64, grade:'C' },
      { code:'ENG', name:'English Language', teacher:'Mrs Ngozi Eze',    ca1:12, ca2:12, exam:47, total:71, grade:'B' },
      { code:'BSC', name:'Basic Science',    teacher:'Mrs Ifeoma Okeke', ca1:13, ca2:13, exam:49, total:75, grade:'B' },
      { code:'SST', name:'Social Studies',   teacher:'Mr Samuel Nnaji',  ca1:11, ca2:11, exam:46, total:68, grade:'C' },
      { code:'ART', name:'Creative Arts',    teacher:'Mr Chibuike Obi',  ca1:14, ca2:14, exam:52, total:80, grade:'A' },
      { code:'BTH', name:'Basic Technology', teacher:'Mrs Adaora Nze',   ca1:9,  ca2:9,  exam:37, total:55, grade:'C' },
    ],
    classTeacherRemark:'Emeka has a natural talent for the arts. He must improve his Mathematics and Technology scores.',
    principalRemark:'Moderate performance. Encourage him to put in more effort.',
    affective:{ punctuality:'Fair', neatness:'Good', politeness:'Good', cooperation:'Good', attentiveness:'Fair' },
    psychomotor:{ drawing:'Excellent', sports:'Good', handwriting:'Fair' },
  },

  /* ── SHC/004 ── */
  'SHC/004::2024/2025::Second Term': {
    studentId:'SHC/004', session:'2024/2025', term:'Second Term',
    classTeacher:'Mrs Adaora Nze', principal:'Rev. Fr. Augustine Eze',
    numberOfStudents:42, position:1, resumptionDate:'2025-04-28',
    subjects:[
      { code:'MTH', name:'Mathematics',      teacher:'Mrs Adaora Nze',   ca1:18, ca2:17, exam:60, total:95, grade:'A' },
      { code:'ENG', name:'English Language', teacher:'Mrs Ngozi Eze',    ca1:17, ca2:17, exam:58, total:92, grade:'A' },
      { code:'CHM', name:'Chemistry',        teacher:'Dr Chibuike Obi',  ca1:16, ca2:15, exam:58, total:89, grade:'A' },
      { code:'BIO', name:'Biology',          teacher:'Mrs Ifeoma Okeke', ca1:17, ca2:17, exam:60, total:94, grade:'A' },
      { code:'PHY', name:'Physics',          teacher:'Mr Emeka Nwosu',   ca1:15, ca2:15, exam:58, total:88, grade:'A' },
      { code:'GEO', name:'Geography',        teacher:'Mr Samuel Nnaji',  ca1:15, ca2:15, exam:57, total:87, grade:'A' },
    ],
    classTeacherRemark:'Chioma is exceptional. Her dedication and intellect set a benchmark for all students.',
    principalRemark:'Outstanding! You are a pride of Sacred Heart College.',
    affective:{ punctuality:'Excellent', neatness:'Excellent', politeness:'Excellent', cooperation:'Excellent', attentiveness:'Excellent' },
    psychomotor:{ drawing:'Very Good', sports:'Good', handwriting:'Excellent' },
  },

  /* ── SHC/005 ── */
  'SHC/005::2024/2025::Second Term': {
    studentId:'SHC/005', session:'2024/2025', term:'Second Term',
    classTeacher:'Mrs Ifeoma Okeke', principal:'Rev. Fr. Augustine Eze',
    numberOfStudents:36, position:15, resumptionDate:'2025-04-28',
    subjects:[
      { code:'MTH', name:'Mathematics',      teacher:'Mr Emeka Nwosu',   ca1:11, ca2:11, exam:46, total:68, grade:'C' },
      { code:'ENG', name:'English Language', teacher:'Mrs Ngozi Eze',    ca1:12, ca2:13, exam:49, total:74, grade:'B' },
      { code:'BSC', name:'Basic Science',    teacher:'Mrs Ifeoma Okeke', ca1:13, ca2:14, exam:50, total:77, grade:'B' },
      { code:'SST', name:'Social Studies',   teacher:'Mr Samuel Nnaji',  ca1:12, ca2:11, exam:47, total:70, grade:'B' },
      { code:'ART', name:'Creative Arts',    teacher:'Mr Chibuike Obi',  ca1:14, ca2:15, exam:53, total:82, grade:'A' },
      { code:'BTH', name:'Basic Technology', teacher:'Mrs Adaora Nze',   ca1:10, ca2:11, exam:44, total:65, grade:'C' },
    ],
    classTeacherRemark:'Ifeanyi shows creativity in practical subjects. Consistent revision will improve his core scores.',
    principalRemark:'A fair performance. More effort is needed in Mathematics.',
    affective:{ punctuality:'Good', neatness:'Fair', politeness:'Good', cooperation:'Very Good', attentiveness:'Good' },
    psychomotor:{ drawing:'Very Good', sports:'Excellent', handwriting:'Good' },
  },

  /* ── SHC/006 ── */
  'SHC/006::2024/2025::Second Term': {
    studentId:'SHC/006', session:'2024/2025', term:'Second Term',
    classTeacher:'Mrs Ngozi Eze', principal:'Rev. Fr. Augustine Eze',
    numberOfStudents:34, position:5, resumptionDate:'2025-04-28',
    subjects:[
      { code:'MTH', name:'Mathematics',      teacher:'Mr Emeka Nwosu',   ca1:15, ca2:15, exam:56, total:86, grade:'A' },
      { code:'ENG', name:'English Language', teacher:'Mrs Ngozi Eze',    ca1:14, ca2:15, exam:55, total:84, grade:'A' },
      { code:'BSC', name:'Basic Science',    teacher:'Mrs Ifeoma Okeke', ca1:14, ca2:14, exam:52, total:80, grade:'A' },
      { code:'SST', name:'Social Studies',   teacher:'Mr Samuel Nnaji',  ca1:14, ca2:14, exam:54, total:82, grade:'A' },
      { code:'ART', name:'Fine Arts',        teacher:'Mr Chibuike Obi',  ca1:16, ca2:16, exam:57, total:89, grade:'A' },
      { code:'MUS', name:'Music',            teacher:'Mrs Adaora Nze',   ca1:12, ca2:12, exam:51, total:75, grade:'B' },
    ],
    classTeacherRemark:'Ngozi is a well-rounded student with a strong work ethic.',
    principalRemark:'Very good results. Keep up the great work, Ngozi.',
    affective:{ punctuality:'Excellent', neatness:'Excellent', politeness:'Excellent', cooperation:'Very Good', attentiveness:'Excellent' },
    psychomotor:{ drawing:'Very Good', sports:'Good', handwriting:'Very Good' },
  },

  /* ── SHC/007 ── */
  'SHC/007::2024/2025::Second Term': {
    studentId:'SHC/007', session:'2024/2025', term:'Second Term',
    classTeacher:'Mr Emeka Nwosu', principal:'Rev. Fr. Augustine Eze',
    numberOfStudents:40, position:8, resumptionDate:'2025-04-28',
    subjects:[
      { code:'MTH', name:'Mathematics',      teacher:'Mr Emeka Nwosu',   ca1:14, ca2:15, exam:53, total:82, grade:'A' },
      { code:'ENG', name:'English Language', teacher:'Mrs Ngozi Eze',    ca1:13, ca2:13, exam:52, total:78, grade:'B' },
      { code:'BIO', name:'Biology',          teacher:'Mrs Ifeoma Okeke', ca1:13, ca2:12, exam:50, total:75, grade:'B' },
      { code:'CHM', name:'Chemistry',        teacher:'Dr Chibuike Obi',  ca1:11, ca2:12, exam:48, total:71, grade:'B' },
      { code:'GEO', name:'Geography',        teacher:'Mr Samuel Nnaji',  ca1:15, ca2:15, exam:53, total:83, grade:'A' },
      { code:'CMP', name:'Computer Studies', teacher:'Mrs Adaora Nze',   ca1:16, ca2:15, exam:55, total:86, grade:'A' },
    ],
    classTeacherRemark:'Obinna demonstrates consistent effort. He excels in STEM and should challenge himself further.',
    principalRemark:'A good performance. We expect even better results next term.',
    affective:{ punctuality:'Good', neatness:'Good', politeness:'Very Good', cooperation:'Very Good', attentiveness:'Good' },
    psychomotor:{ drawing:'Good', sports:'Very Good', handwriting:'Good' },
  },

  /* ── SHC/008 ── */
  'SHC/008::2024/2025::Second Term': {
    studentId:'SHC/008', session:'2024/2025', term:'Second Term',
    classTeacher:'Mrs Ngozi Eze', principal:'Rev. Fr. Augustine Eze',
    numberOfStudents:33, position:2, resumptionDate:'2025-04-28',
    subjects:[
      { code:'MTH', name:'Mathematics',      teacher:'Mr Emeka Nwosu',   ca1:16, ca2:16, exam:59, total:91, grade:'A' },
      { code:'ENG', name:'English Language', teacher:'Mrs Ngozi Eze',    ca1:16, ca2:15, exam:58, total:89, grade:'A' },
      { code:'BSC', name:'Basic Science',    teacher:'Mrs Ifeoma Okeke', ca1:15, ca2:14, exam:56, total:85, grade:'A' },
      { code:'SST', name:'Social Studies',   teacher:'Mr Samuel Nnaji',  ca1:14, ca2:14, exam:54, total:82, grade:'A' },
      { code:'ART', name:'Creative Arts',    teacher:'Mr Chibuike Obi',  ca1:18, ca2:17, exam:59, total:94, grade:'A' },
      { code:'MUS', name:'Music',            teacher:'Mrs Adaora Nze',   ca1:14, ca2:13, exam:53, total:80, grade:'A' },
    ],
    classTeacherRemark:'Amara is an outstanding student with exceptional artistic talent.',
    principalRemark:'Brilliant performance. Aim for the top spot next term!',
    affective:{ punctuality:'Excellent', neatness:'Excellent', politeness:'Excellent', cooperation:'Excellent', attentiveness:'Excellent' },
    psychomotor:{ drawing:'Outstanding', sports:'Good', handwriting:'Excellent' },
  },

  /* ── SHC/009 ── */
  'SHC/009::2024/2025::Second Term': {
    studentId:'SHC/009', session:'2024/2025', term:'Second Term',
    classTeacher:'Mr Samuel Nnaji', principal:'Rev. Fr. Augustine Eze',
    numberOfStudents:40, position:10, resumptionDate:'2025-04-28',
    subjects:[
      { code:'MTH', name:'Mathematics',      teacher:'Mr Emeka Nwosu',   ca1:14, ca2:13, exam:53, total:80, grade:'A' },
      { code:'ENG', name:'English Language', teacher:'Mrs Ngozi Eze',    ca1:12, ca2:13, exam:50, total:75, grade:'B' },
      { code:'BIO', name:'Biology',          teacher:'Mrs Ifeoma Okeke', ca1:13, ca2:13, exam:51, total:77, grade:'B' },
      { code:'CHM', name:'Chemistry',        teacher:'Dr Chibuike Obi',  ca1:10, ca2:11, exam:47, total:68, grade:'C' },
      { code:'GEO', name:'Geography',        teacher:'Mr Samuel Nnaji',  ca1:13, ca2:14, exam:52, total:79, grade:'B' },
      { code:'CMP', name:'Computer Studies', teacher:'Mrs Adaora Nze',   ca1:15, ca2:15, exam:54, total:84, grade:'A' },
    ],
    classTeacherRemark:'Kelechi performs well in Technology and Mathematics. He should work on improving Chemistry.',
    principalRemark:'Good performance. Sustained effort will take you higher.',
    affective:{ punctuality:'Good', neatness:'Good', politeness:'Good', cooperation:'Good', attentiveness:'Good' },
    psychomotor:{ drawing:'Good', sports:'Very Good', handwriting:'Good' },
  },

  /* ── SHC/010 ── */
  'SHC/010::2024/2025::Second Term': {
    studentId:'SHC/010', session:'2024/2025', term:'Second Term',
    classTeacher:'Mrs Ifeoma Okeke', principal:'Rev. Fr. Augustine Eze',
    numberOfStudents:36, position:2, resumptionDate:'2025-04-28',
    subjects:[
      { code:'MTH', name:'Mathematics',      teacher:'Mr Emeka Nwosu',   ca1:16, ca2:17, exam:59, total:92, grade:'A' },
      { code:'ENG', name:'English Language', teacher:'Mrs Ngozi Eze',    ca1:16, ca2:16, exam:58, total:90, grade:'A' },
      { code:'BSC', name:'Basic Science',    teacher:'Mrs Ifeoma Okeke', ca1:15, ca2:15, exam:56, total:86, grade:'A' },
      { code:'SST', name:'Social Studies',   teacher:'Mr Samuel Nnaji',  ca1:14, ca2:15, exam:56, total:85, grade:'A' },
      { code:'ART', name:'Fine Arts',        teacher:'Mr Chibuike Obi',  ca1:16, ca2:17, exam:58, total:91, grade:'A' },
      { code:'BTH', name:'Basic Technology', teacher:'Mrs Adaora Nze',   ca1:14, ca2:14, exam:52, total:80, grade:'A' },
    ],
    classTeacherRemark:'Nneka is a brilliant and hardworking student. She leads by example.',
    principalRemark:'Outstanding performance. We are proud of you, Nneka!',
    affective:{ punctuality:'Excellent', neatness:'Excellent', politeness:'Excellent', cooperation:'Excellent', attentiveness:'Excellent' },
    psychomotor:{ drawing:'Excellent', sports:'Very Good', handwriting:'Excellent' },
  },
};

/* ─────────────────────────────────────────────────────────────
   CLASS COMPARISON DATA  (anonymised class averages + highs)
───────────────────────────────────────────────────────────── */
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

/* ─────────────────────────────────────────────────────────────
   HELPERS
───────────────────────────────────────────────────────────── */
function _ok(res, data, meta = {}) {
  return res.status(200).json({ success: true, ...meta, data });
}
function _notFound(res, msg) {
  return res.status(404).json({ success: false, error: msg, statusCode: 404 });
}
function _forbidden(res, msg) {
  return res.status(403).json({ success: false, error: msg, statusCode: 403 });
}
function _fmtDate(iso) {
  const d = new Date(iso);
  return isNaN(d) ? iso : d.toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' });
}
function _canAccess(session, studentId, studentClass, studentArm) {
  if (!session) return false;
  if (session.role === 'Admin') return true;
  if (session.role === 'Teacher') {
    return session.assignedClass === studentClass && session.assignedArm === studentArm;
  }
  if (session.role === 'Parent') {
    return Array.isArray(session.children) &&
           session.children.some(c => c.studentId === studentId);
  }
  return false;
}
function _sheetSummary(sheet) {
  const total = sheet.subjects.reduce((a, s) => a + s.total, 0);
  const avg   = Math.round(total / sheet.subjects.length);
  return { totalScore: total, maxScore: sheet.subjects.length * 100, average: avg, grade: _gradeInfo(avg).grade };
}

/* ─────────────────────────────────────────────────────────────
   CONTROLLER METHODS
───────────────────────────────────────────────────────────── */

/**
 * GET /api/check-result/available-terms/:studentId
 */
exports.getAvailableTerms = (req, res) => {
  const { studentId } = req.params;
  const student = STUDENTS[studentId];
  if (!student) return _notFound(res, `Student ${studentId} not found.`);

  const TERMS = ['First Term','Second Term','Third Term'];
  const academicSession = req.query.session || '2024/2025';

  const available = TERMS
    .filter(t => {
      const sheet = RESULT_SHEETS[`${studentId}::${academicSession}::${t}`];
      return sheet && _canAccess(req.shcSession, studentId, student.class, student.arm);
    })
    .map((t, i) => ({
      term:            t,
      academicSession,
      label:           `${t} — ${academicSession}`,
      value:           t.toLowerCase().replace(' ', '-'),
      isCurrent:       t === 'Second Term',
      order:           i + 1,
    }));

  return _ok(res, available, { count: available.length });
};

/**
 * GET /api/check-result/sheet/:studentId
 */
exports.getResultSheet = (req, res) => {
  const { studentId }  = req.params;
  const academicSession = req.query.session || '2024/2025';
  const term            = req.query.term    || 'Second Term';

  const student = STUDENTS[studentId];
  if (!student) return _notFound(res, `Student ${studentId} not found.`);
  if (!_canAccess(req.shcSession, studentId, student.class, student.arm)) {
    return _forbidden(res, 'You do not have permission to view this result sheet.');
  }

  const key   = `${studentId}::${academicSession}::${term}`;
  const sheet = RESULT_SHEETS[key];
  if (!sheet) return _notFound(res, `No result sheet found for ${studentId} — ${academicSession} ${term}.`);

  const subjects  = sheet.subjects.map(s => ({
    ...s,
    gradeInfo:   _gradeInfo(s.total),
    caTotal:     s.ca1 + s.ca2,
  }));

  const summary = _sheetSummary(sheet);

  return _ok(res, {
    studentId,
    name:         student.name,
    class:        student.class,
    arm:          student.arm,
    gender:       student.gender,
    session:      academicSession,
    term,
    classTeacher: sheet.classTeacher,
    principal:    sheet.principal,
    position:     sheet.position,
    numberOfStudents: sheet.numberOfStudents,
    resumptionDate:   _fmtDate(sheet.resumptionDate),
    subjects,
    summary,
    classTeacherRemark: sheet.classTeacherRemark,
    principalRemark:    sheet.principalRemark,
    affective:          sheet.affective,
    psychomotor:        sheet.psychomotor,
    meta: { generatedAt: new Date().toISOString(), viewerRole: req.shcSession.role },
  });
};

/**
 * GET /api/check-result/subject-detail/:studentId/:subjectCode
 */
exports.getSubjectDetail = (req, res) => {
  const { studentId, subjectCode } = req.params;
  const academicSession = req.query.session || '2024/2025';
  const term            = req.query.term    || 'Second Term';

  const student = STUDENTS[studentId];
  if (!student) return _notFound(res, `Student ${studentId} not found.`);
  if (!_canAccess(req.shcSession, studentId, student.class, student.arm)) {
    return _forbidden(res, 'Access denied.');
  }

  const sheet = RESULT_SHEETS[`${studentId}::${academicSession}::${term}`];
  if (!sheet) return _notFound(res, 'Result sheet not found.');

  const subject = sheet.subjects.find(s => s.code === subjectCode.toUpperCase());
  if (!subject)  return _notFound(res, `Subject code "${subjectCode}" not found.`);

  const classKey  = `${student.class}-${student.arm}`;
  const classData = CLASS_STATS[classKey];
  const cls       = classData?.[subjectCode.toUpperCase()];

  return _ok(res, {
    studentId,
    studentName: student.name,
    session:     academicSession,
    term,
    subject: {
      ...subject,
      gradeInfo: _gradeInfo(subject.total),
      breakdown: [
        { label:'Continuous Assessment 1', score:subject.ca1,  outOf:15 },
        { label:'Continuous Assessment 2', score:subject.ca2,  outOf:15 },
        { label:'Terminal Examination',    score:subject.exam, outOf:70 },
        { label:'Total',                   score:subject.total,outOf:100 },
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

/**
 * GET /api/check-result/term-trend/:studentId
 */
exports.getTermTrend = (req, res) => {
  const { studentId } = req.params;
  const student = STUDENTS[studentId];
  if (!student) return _notFound(res, `Student ${studentId} not found.`);
  if (!_canAccess(req.shcSession, studentId, student.class, student.arm)) {
    return _forbidden(res, 'Access denied.');
  }

  const TERMS    = ['First Term','Second Term','Third Term'];
  const sessions = ['2024/2025'];
  const trend    = [];

  sessions.forEach(sess => {
    TERMS.forEach(term => {
      const key   = `${studentId}::${sess}::${term}`;
      const sheet = RESULT_SHEETS[key];
      if (!sheet) return;
      const sum = _sheetSummary(sheet);
      const classKey = `${student.class}-${student.arm}`;
      trend.push({
        label:        `${term.split(' ')[0]} ${sess.split('/')[0]}`,
        term,
        session:      sess,
        average:      sum.average,
        position:     sheet.position,
        classSize:    sheet.numberOfStudents,
        classAverage: _classAvg(classKey),
        delta:        trend.length > 0 ? sum.average - trend[trend.length - 1].average : 0,
      });
    });
  });

  return _ok(res, { studentId, studentName: student.name, trend }, { count: trend.length });
};

/**
 * GET /api/check-result/class-comparison/:studentId
 */
exports.getClassComparison = (req, res) => {
  const { studentId }  = req.params;
  const academicSession = req.query.session || '2024/2025';
  const term            = req.query.term    || 'Second Term';

  const student = STUDENTS[studentId];
  if (!student) return _notFound(res, `Student ${studentId} not found.`);
  if (!_canAccess(req.shcSession, studentId, student.class, student.arm)) {
    return _forbidden(res, 'Access denied.');
  }

  const sheet = RESULT_SHEETS[`${studentId}::${academicSession}::${term}`];
  if (!sheet) return _notFound(res, 'Result sheet not found.');

  const classKey  = `${student.class}-${student.arm}`;
  const classData = CLASS_STATS[classKey] || {};

  const comparison = sheet.subjects.map(s => ({
    code:         s.code,
    name:         s.name,
    studentScore: s.total,
    classAverage: classData[s.code]?.avg ?? null,
    classHighest: classData[s.code]?.high ?? null,
    aboveAverage: classData[s.code] ? s.total >= classData[s.code].avg : null,
  }));

  return _ok(res, { studentId, studentName: student.name, session: academicSession, term, comparison });
};

/**
 * GET /api/check-result/assessments/:studentId
 */
exports.getAllAssessments = (req, res) => {
  const { studentId }  = req.params;
  const academicSession = req.query.session || '2024/2025';
  const term            = req.query.term    || 'Second Term';

  const student = STUDENTS[studentId];
  if (!student) return _notFound(res, `Student ${studentId} not found.`);
  if (!_canAccess(req.shcSession, studentId, student.class, student.arm)) {
    return _forbidden(res, 'Access denied.');
  }

  /* Pull assessments from the parent portal data (already has detail-level list) */
  const ACADEMIC_DB = require('./parentPortalController').ACADEMIC_DB
    ? require('./parentPortalController').ACADEMIC_DB
    : null;

  /* Inline fallback assessment data */
  const ASSESSMENT_STORE = {
    'SHC/001':[ {title:'Mathematics — CA Test 2',date:'2025-03-18',score:78,outOf:100,type:'CA'},{title:'Chemistry — Practical',date:'2025-03-14',score:65,outOf:100,type:'Practical'},{title:'English — Essay',date:'2025-03-11',score:72,outOf:100,type:'CA'},{title:'Computer Studies — Project',date:'2025-03-07',score:88,outOf:100,type:'Project'},{title:'Biology — Quiz 4',date:'2025-03-04',score:80,outOf:100,type:'Quiz'},{title:'Geography — Assignment',date:'2025-02-28',score:74,outOf:100,type:'Assignment'} ],
    'SHC/002':[ {title:'Fine Arts — Portfolio',date:'2025-03-20',score:93,outOf:100,type:'Project'},{title:'Mathematics — Mid-Term',date:'2025-03-17',score:90,outOf:100,type:'Exam'},{title:'English — Comprehension',date:'2025-03-13',score:88,outOf:100,type:'CA'},{title:'Social Studies — Assignment',date:'2025-03-10',score:79,outOf:100,type:'Assignment'},{title:'Music — Practical',date:'2025-03-06',score:76,outOf:100,type:'Practical'} ],
    'SHC/003':[ {title:'Creative Arts — Project',date:'2025-03-19',score:80,outOf:100,type:'Project'},{title:'Basic Science — Quiz 3',date:'2025-03-15',score:75,outOf:100,type:'Quiz'},{title:'Mathematics — CA Test',date:'2025-03-12',score:64,outOf:100,type:'CA'},{title:'English — Composition',date:'2025-03-08',score:71,outOf:100,type:'CA'},{title:'Basic Technology — Drawing',date:'2025-03-05',score:55,outOf:100,type:'Practical'} ],
    'SHC/004':[ {title:'Biology — Mid-Term Exam',date:'2025-03-21',score:94,outOf:100,type:'Exam'},{title:'Mathematics — Test 3',date:'2025-03-18',score:95,outOf:100,type:'CA'},{title:'Chemistry — Lab Practical',date:'2025-03-14',score:89,outOf:100,type:'Practical'},{title:'English — Oral & Written',date:'2025-03-11',score:92,outOf:100,type:'CA'},{title:'Physics — Assignment',date:'2025-03-07',score:88,outOf:100,type:'Assignment'} ],
    'SHC/005':[ {title:'Creative Arts — Drawing',date:'2025-03-19',score:82,outOf:100,type:'CA'},{title:'Basic Science — Test',date:'2025-03-15',score:77,outOf:100,type:'CA'},{title:'English — Reading',date:'2025-03-11',score:74,outOf:100,type:'CA'},{title:'Mathematics — CA 2',date:'2025-03-08',score:68,outOf:100,type:'CA'},{title:'Social Studies — Quiz',date:'2025-03-05',score:70,outOf:100,type:'Quiz'} ],
    'SHC/006':[ {title:'Fine Arts — Portfolio',date:'2025-03-20',score:89,outOf:100,type:'Project'},{title:'Mathematics — CA Test',date:'2025-03-16',score:86,outOf:100,type:'CA'},{title:'Basic Science — Practical',date:'2025-03-12',score:80,outOf:100,type:'Practical'},{title:'English — Essay',date:'2025-03-09',score:84,outOf:100,type:'CA'},{title:'Music — Practical',date:'2025-03-05',score:75,outOf:100,type:'Practical'} ],
    'SHC/007':[ {title:'Geography — Field Report',date:'2025-03-20',score:83,outOf:100,type:'Project'},{title:'Mathematics — Test 3',date:'2025-03-17',score:82,outOf:100,type:'CA'},{title:'English — Composition',date:'2025-03-13',score:78,outOf:100,type:'CA'},{title:'Computer Studies — Quiz',date:'2025-03-09',score:86,outOf:100,type:'Quiz'},{title:'Chemistry — Lab Report',date:'2025-03-05',score:71,outOf:100,type:'Practical'} ],
    'SHC/008':[ {title:'Creative Arts — Final Piece',date:'2025-03-21',score:94,outOf:100,type:'Project'},{title:'Mathematics — CA Test 2',date:'2025-03-17',score:91,outOf:100,type:'CA'},{title:'English — Reading/Writing',date:'2025-03-13',score:89,outOf:100,type:'CA'},{title:'Basic Science — Test',date:'2025-03-10',score:85,outOf:100,type:'CA'},{title:'Music — Choir Recital',date:'2025-03-06',score:80,outOf:100,type:'Practical'} ],
    'SHC/009':[ {title:'Computer Studies — Project',date:'2025-03-20',score:84,outOf:100,type:'Project'},{title:'Mathematics — Mid-Term',date:'2025-03-17',score:80,outOf:100,type:'Exam'},{title:'Geography — Assignment',date:'2025-03-13',score:79,outOf:100,type:'Assignment'},{title:'English — Oral Test',date:'2025-03-09',score:75,outOf:100,type:'CA'},{title:'Chemistry — Lab',date:'2025-03-05',score:68,outOf:100,type:'Practical'} ],
    'SHC/010':[ {title:'Fine Arts — Portfolio',date:'2025-03-21',score:91,outOf:100,type:'Project'},{title:'Mathematics — CA Test 2',date:'2025-03-18',score:92,outOf:100,type:'CA'},{title:'English — Essay',date:'2025-03-13',score:90,outOf:100,type:'CA'},{title:'Social Studies — Quiz',date:'2025-03-10',score:85,outOf:100,type:'Quiz'},{title:'Basic Science — Practical',date:'2025-03-06',score:86,outOf:100,type:'Practical'} ],
  };

  let list = [...(ASSESSMENT_STORE[studentId] || [])];

  if (req.query.subject) {
    const f = req.query.subject.toLowerCase();
    list = list.filter(a => a.title.toLowerCase().includes(f));
  }

  const limit = Math.min(parseInt(req.query.limit) || 20, 50);
  list = list.slice(0, limit).map(a => ({
    ...a,
    dot:           a.score >= 75 ? 'green' : a.score >= 50 ? 'gold' : 'rust',
    displayScore:  `${a.score}/${a.outOf}`,
    dateFormatted: _fmtDate(a.date),
    gradeInfo:     _gradeInfo(a.score),
  }));

  return _ok(res, { studentId, studentName: student.name, session: academicSession, term, assessments: list }, { count: list.length });
};

/**
 * GET /api/check-result/report-card/:studentId
 * Full printable report-card payload.
 */
exports.getReportCard = (req, res) => {
  /* Piggyback on getResultSheet — call with same req/res */
  const { studentId }  = req.params;
  const academicSession = req.query.session || '2024/2025';
  const term            = req.query.term    || 'Second Term';

  const student = STUDENTS[studentId];
  if (!student) return _notFound(res, `Student ${studentId} not found.`);
  if (!_canAccess(req.shcSession, studentId, student.class, student.arm)) {
    return _forbidden(res, 'Access denied.');
  }

  const sheet = RESULT_SHEETS[`${studentId}::${academicSession}::${term}`];
  if (!sheet) return _notFound(res, 'Result sheet not found.');

  const subjects = sheet.subjects.map(s => ({ ...s, gradeInfo: _gradeInfo(s.total), caTotal: s.ca1 + s.ca2 }));
  const summary  = _sheetSummary(sheet);

  /* Determine promotion status (pass = avg ≥ 45 with no F) */
  const hasFailure = subjects.some(s => s.total < 45);
  const promoted   = !hasFailure && summary.average >= 45;

  return _ok(res, {
    /* Student info */
    studentId, name: student.name, class: student.class, arm: student.arm, gender: student.gender,
    session: academicSession, term,
    /* School info */
    schoolInfo: {
      name:      'Sacred Heart College',
      location:  'Eziukwu, Aba, Abia State, Nigeria',
      motto:     'Truth, Virtue and Knowledge',
      email:     'info@shc.edu.ng',
      phone:     '+234 803 000 0000',
      principal: sheet.principal,
    },
    /* Result */
    classTeacher:       sheet.classTeacher,
    subjects,
    summary,
    position:           sheet.position,
    numberOfStudents:   sheet.numberOfStudents,
    promotionStatus:    promoted ? 'Promoted to Next Class' : 'Requires Review',
    resumptionDate:     _fmtDate(sheet.resumptionDate),
    /* Remarks & domains */
    classTeacherRemark: sheet.classTeacherRemark,
    principalRemark:    sheet.principalRemark,
    affective:          sheet.affective,
    psychomotor:        sheet.psychomotor,
    /* Reference tables */
    gradingScale:       GRADE_SCALE,
    /* Meta */
    printedAt:          new Date().toISOString(),
    printedBy:          req.shcSession.name,
  });
};

/* ─────────────────────────────────────────────────────────────
   PRIVATE  —  rough class average from CLASS_STATS
───────────────────────────────────────────────────────────── */
function _classAvg(classKey) {
  const data = CLASS_STATS[classKey];
  if (!data) return null;
  const vals = Object.values(data).map(v => v.avg);
  return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
}