/* ============================================================
   Sacred Heart College Eziukwu Aba – School Portal
   controllers/parentPortalController.js
   ============================================================
   Express controller for every /api/parent-portal/* route.
   Each export maps 1-to-1 to a route registered in routes.js.

   Methods exported:
     getChildren           GET /api/parent-portal/children
     getStudentSummary     GET /api/parent-portal/summary/:studentId
     getSubjectScores      GET /api/parent-portal/subjects/:studentId
     getAttendance         GET /api/parent-portal/attendance/:studentId
     getRecentAssessments  GET /api/parent-portal/recent-assessments/:studentId
     getAllTermsResult      GET /api/parent-portal/all-terms/:studentId
   ============================================================ */

'use strict';

const { STUDENTS } = require('../data/users');

/* ─────────────────────────────────────────────────────────────
   ACADEMIC DATA STORE
   Keyed by studentId. Replace with DB queries in production.
───────────────────────────────────────────────────────────── */
const ACADEMIC_DB = {
  'SHC/001': {
    session:'2024/2025', term:'Second Term', avg:74, rank:'12th', classSize:40, attendance:92, trend:'−0.1 this term',
    subjects:[
      { code:'MTH', name:'Mathematics',      teacher:'Mr Emeka Nwosu',   ca:28, exam:50, total:78, grade:'B', color:'gold'  },
      { code:'ENG', name:'English Language', teacher:'Mrs Ngozi Eze',    ca:25, exam:47, total:72, grade:'B', color:'gold'  },
      { code:'BIO', name:'Biology',          teacher:'Mrs Ifeoma Okeke', ca:30, exam:50, total:80, grade:'A', color:'green' },
      { code:'CHM', name:'Chemistry',        teacher:'Dr Chibuike Obi',  ca:20, exam:45, total:65, grade:'C', color:'rust'  },
      { code:'GEO', name:'Geography',        teacher:'Mr Samuel Nnaji',  ca:26, exam:48, total:74, grade:'B', color:'gold'  },
      { code:'CMP', name:'Computer Studies', teacher:'Mrs Adaora Nze',   ca:33, exam:55, total:88, grade:'A', color:'green' },
    ],
    assessments:[
      { title:'Mathematics — CA Test 2',    date:'2025-03-18', score:78,  outOf:100, type:'CA'        },
      { title:'Chemistry — Practical',      date:'2025-03-14', score:65,  outOf:100, type:'Practical' },
      { title:'English — Essay',            date:'2025-03-11', score:72,  outOf:100, type:'CA'        },
      { title:'Computer Studies — Project', date:'2025-03-07', score:88,  outOf:100, type:'Project'   },
      { title:'Biology — Quiz 4',           date:'2025-03-04', score:80,  outOf:100, type:'Quiz'      },
    ],
    attendance_detail:{ present:17, absent:2, late:2, total:21,
      marchGrid:['present','holiday','present','present','absent','holiday','holiday',
                 'present','present','present','present','late','holiday','holiday',
                 'present','absent','present','present','late','holiday','holiday',
                 'present','present','present','present','future','holiday','holiday'] },
    allTerms:[
      { term:'First Term',  session:'2024/2025', avg:71, rank:'14th', classSize:40 },
      { term:'Second Term', session:'2024/2025', avg:74, rank:'12th', classSize:40 },
    ],
  },
  'SHC/002': {
    session:'2024/2025', term:'Second Term', avg:85, rank:'3rd', classSize:38, attendance:97, trend:'+0.4 this term',
    subjects:[
      { code:'MTH', name:'Mathematics',      teacher:'Mr Emeka Nwosu',   ca:33, exam:57, total:90, grade:'A', color:'green' },
      { code:'ENG', name:'English Language', teacher:'Mrs Ngozi Eze',    ca:32, exam:56, total:88, grade:'A', color:'green' },
      { code:'BSC', name:'Basic Science',    teacher:'Mrs Ifeoma Okeke', ca:30, exam:54, total:84, grade:'A', color:'green' },
      { code:'SST', name:'Social Studies',   teacher:'Mr Samuel Nnaji',  ca:27, exam:52, total:79, grade:'B', color:'gold'  },
      { code:'ART', name:'Fine Arts',        teacher:'Mr Chibuike Obi',  ca:35, exam:58, total:93, grade:'A', color:'green' },
      { code:'MUS', name:'Music',            teacher:'Mrs Adaora Nze',   ca:25, exam:51, total:76, grade:'B', color:'gold'  },
    ],
    assessments:[
      { title:'Fine Arts — Portfolio',       date:'2025-03-20', score:93, outOf:100, type:'Project'   },
      { title:'Mathematics — Mid-Term Test', date:'2025-03-17', score:90, outOf:100, type:'Exam'      },
      { title:'English — Comprehension',     date:'2025-03-13', score:88, outOf:100, type:'CA'        },
      { title:'Social Studies — Assignment', date:'2025-03-10', score:79, outOf:100, type:'Assignment'},
      { title:'Music — Practical',           date:'2025-03-06', score:76, outOf:100, type:'Practical' },
    ],
    attendance_detail:{ present:20, absent:0, late:1, total:21,
      marchGrid:['present','holiday','present','present','present','holiday','holiday',
                 'present','present','present','present','late','holiday','holiday',
                 'present','present','present','present','present','holiday','holiday',
                 'present','present','present','present','future','holiday','holiday'] },
    allTerms:[
      { term:'First Term',  session:'2024/2025', avg:81, rank:'5th',  classSize:38 },
      { term:'Second Term', session:'2024/2025', avg:85, rank:'3rd',  classSize:38 },
    ],
  },
  'SHC/003': {
    session:'2024/2025', term:'Second Term', avg:69, rank:'21st', classSize:35, attendance:88, trend:'+0.1 this term',
    subjects:[
      { code:'MTH', name:'Mathematics',      teacher:'Mr Emeka Nwosu',   ca:20, exam:44, total:64, grade:'C', color:'rust'  },
      { code:'ENG', name:'English Language', teacher:'Mrs Ngozi Eze',    ca:24, exam:47, total:71, grade:'B', color:'gold'  },
      { code:'BSC', name:'Basic Science',    teacher:'Mrs Ifeoma Okeke', ca:26, exam:49, total:75, grade:'B', color:'gold'  },
      { code:'SST', name:'Social Studies',   teacher:'Mr Samuel Nnaji',  ca:22, exam:46, total:68, grade:'C', color:'rust'  },
      { code:'ART', name:'Creative Arts',    teacher:'Mr Chibuike Obi',  ca:28, exam:52, total:80, grade:'A', color:'green' },
      { code:'BTH', name:'Basic Technology', teacher:'Mrs Adaora Nze',   ca:18, exam:37, total:55, grade:'C', color:'rust'  },
    ],
    assessments:[
      { title:'Creative Arts — Project',    date:'2025-03-19', score:80, outOf:100, type:'Project'   },
      { title:'Basic Science — Quiz 3',     date:'2025-03-15', score:75, outOf:100, type:'Quiz'      },
      { title:'Mathematics — CA Test',      date:'2025-03-12', score:64, outOf:100, type:'CA'        },
      { title:'English — Composition',      date:'2025-03-08', score:71, outOf:100, type:'CA'        },
      { title:'Basic Technology — Drawing', date:'2025-03-05', score:55, outOf:100, type:'Practical' },
    ],
    attendance_detail:{ present:15, absent:3, late:3, total:21,
      marchGrid:['present','holiday','absent','present','present','holiday','holiday',
                 'present','late','present','absent','present','holiday','holiday',
                 'present','present','present','present','late','holiday','holiday',
                 'late','present','absent','present','future','holiday','holiday'] },
    allTerms:[
      { term:'First Term',  session:'2024/2025', avg:68, rank:'22nd', classSize:35 },
      { term:'Second Term', session:'2024/2025', avg:69, rank:'21st', classSize:35 },
    ],
  },
  'SHC/004': {
    session:'2024/2025', term:'Second Term', avg:91, rank:'1st', classSize:42, attendance:99, trend:'+0.6 this term',
    subjects:[
      { code:'MTH', name:'Mathematics',      teacher:'Mrs Adaora Nze',   ca:35, exam:60, total:95, grade:'A', color:'green' },
      { code:'ENG', name:'English Language', teacher:'Mrs Ngozi Eze',    ca:34, exam:58, total:92, grade:'A', color:'green' },
      { code:'CHM', name:'Chemistry',        teacher:'Dr Chibuike Obi',  ca:31, exam:58, total:89, grade:'A', color:'green' },
      { code:'BIO', name:'Biology',          teacher:'Mrs Ifeoma Okeke', ca:34, exam:60, total:94, grade:'A', color:'green' },
      { code:'PHY', name:'Physics',          teacher:'Mr Emeka Nwosu',   ca:30, exam:58, total:88, grade:'A', color:'green' },
      { code:'GEO', name:'Geography',        teacher:'Mr Samuel Nnaji',  ca:30, exam:57, total:87, grade:'A', color:'green' },
    ],
    assessments:[
      { title:'Biology — Mid-Term Exam',   date:'2025-03-21', score:94, outOf:100, type:'Exam'      },
      { title:'Mathematics — Test 3',      date:'2025-03-18', score:95, outOf:100, type:'CA'        },
      { title:'Chemistry — Lab Practical', date:'2025-03-14', score:89, outOf:100, type:'Practical' },
      { title:'English — Oral & Written',  date:'2025-03-11', score:92, outOf:100, type:'CA'        },
      { title:'Physics — Assignment',      date:'2025-03-07', score:88, outOf:100, type:'Assignment'},
    ],
    attendance_detail:{ present:21, absent:0, late:0, total:21,
      marchGrid:['present','holiday','present','present','present','holiday','holiday',
                 'present','present','present','present','present','holiday','holiday',
                 'present','present','present','present','present','holiday','holiday',
                 'present','present','present','present','future','holiday','holiday'] },
    allTerms:[
      { term:'First Term',  session:'2024/2025', avg:85, rank:'2nd', classSize:42 },
      { term:'Second Term', session:'2024/2025', avg:91, rank:'1st', classSize:42 },
    ],
  },
  'SHC/005': {
    session:'2024/2025', term:'Second Term', avg:71, rank:'15th', classSize:36, attendance:91, trend:'0.0 this term',
    subjects:[
      { code:'MTH', name:'Mathematics',      teacher:'Mr Emeka Nwosu',   ca:22, exam:46, total:68, grade:'C', color:'rust'  },
      { code:'ENG', name:'English Language', teacher:'Mrs Ngozi Eze',    ca:25, exam:49, total:74, grade:'B', color:'gold'  },
      { code:'BSC', name:'Basic Science',    teacher:'Mrs Ifeoma Okeke', ca:27, exam:50, total:77, grade:'B', color:'gold'  },
      { code:'SST', name:'Social Studies',   teacher:'Mr Samuel Nnaji',  ca:23, exam:47, total:70, grade:'B', color:'gold'  },
      { code:'ART', name:'Creative Arts',    teacher:'Mr Chibuike Obi',  ca:29, exam:53, total:82, grade:'A', color:'green' },
      { code:'BTH', name:'Basic Technology', teacher:'Mrs Adaora Nze',   ca:21, exam:44, total:65, grade:'C', color:'rust'  },
    ],
    assessments:[
      { title:'Creative Arts — Drawing', date:'2025-03-19', score:82, outOf:100, type:'CA'        },
      { title:'Basic Science — Test',    date:'2025-03-15', score:77, outOf:100, type:'CA'        },
      { title:'English — Reading',       date:'2025-03-11', score:74, outOf:100, type:'CA'        },
      { title:'Mathematics — CA 2',      date:'2025-03-08', score:68, outOf:100, type:'CA'        },
      { title:'Social Studies — Quiz',   date:'2025-03-05', score:70, outOf:100, type:'Quiz'      },
    ],
    attendance_detail:{ present:16, absent:2, late:3, total:21,
      marchGrid:['present','holiday','present','absent','present','holiday','holiday',
                 'late','present','present','present','present','holiday','holiday',
                 'present','absent','present','late','present','holiday','holiday',
                 'present','late','present','present','future','holiday','holiday'] },
    allTerms:[
      { term:'First Term',  session:'2024/2025', avg:70, rank:'16th', classSize:36 },
      { term:'Second Term', session:'2024/2025', avg:71, rank:'15th', classSize:36 },
    ],
  },
  'SHC/006': {
    session:'2024/2025', term:'Second Term', avg:83, rank:'5th', classSize:34, attendance:96, trend:'+0.3 this term',
    subjects:[
      { code:'MTH', name:'Mathematics',      teacher:'Mr Emeka Nwosu',   ca:30, exam:56, total:86, grade:'A', color:'green' },
      { code:'ENG', name:'English Language', teacher:'Mrs Ngozi Eze',    ca:29, exam:55, total:84, grade:'A', color:'green' },
      { code:'BSC', name:'Basic Science',    teacher:'Mrs Ifeoma Okeke', ca:28, exam:52, total:80, grade:'A', color:'green' },
      { code:'SST', name:'Social Studies',   teacher:'Mr Samuel Nnaji',  ca:28, exam:54, total:82, grade:'A', color:'green' },
      { code:'ART', name:'Fine Arts',        teacher:'Mr Chibuike Obi',  ca:32, exam:57, total:89, grade:'A', color:'green' },
      { code:'MUS', name:'Music',            teacher:'Mrs Adaora Nze',   ca:24, exam:51, total:75, grade:'B', color:'gold'  },
    ],
    assessments:[
      { title:'Fine Arts — Portfolio',     date:'2025-03-20', score:89, outOf:100, type:'Project'   },
      { title:'Mathematics — CA Test',     date:'2025-03-16', score:86, outOf:100, type:'CA'        },
      { title:'Basic Science — Practical', date:'2025-03-12', score:80, outOf:100, type:'Practical' },
      { title:'English — Essay',           date:'2025-03-09', score:84, outOf:100, type:'CA'        },
      { title:'Music — Practical',         date:'2025-03-05', score:75, outOf:100, type:'Practical' },
    ],
    attendance_detail:{ present:19, absent:1, late:1, total:21,
      marchGrid:['present','holiday','present','present','present','holiday','holiday',
                 'present','present','present','absent','present','holiday','holiday',
                 'present','present','present','late','present','holiday','holiday',
                 'present','present','present','present','future','holiday','holiday'] },
    allTerms:[
      { term:'First Term',  session:'2024/2025', avg:80, rank:'7th', classSize:34 },
      { term:'Second Term', session:'2024/2025', avg:83, rank:'5th', classSize:34 },
    ],
  },
  'SHC/007': {
    session:'2024/2025', term:'Second Term', avg:79, rank:'8th', classSize:40, attendance:95, trend:'+0.2 this term',
    subjects:[
      { code:'MTH', name:'Mathematics',      teacher:'Mr Emeka Nwosu',   ca:29, exam:53, total:82, grade:'A', color:'green' },
      { code:'ENG', name:'English Language', teacher:'Mrs Ngozi Eze',    ca:26, exam:52, total:78, grade:'B', color:'gold'  },
      { code:'BIO', name:'Biology',          teacher:'Mrs Ifeoma Okeke', ca:25, exam:50, total:75, grade:'B', color:'gold'  },
      { code:'CHM', name:'Chemistry',        teacher:'Dr Chibuike Obi',  ca:23, exam:48, total:71, grade:'B', color:'gold'  },
      { code:'GEO', name:'Geography',        teacher:'Mr Samuel Nnaji',  ca:30, exam:53, total:83, grade:'A', color:'green' },
      { code:'CMP', name:'Computer Studies', teacher:'Mrs Adaora Nze',   ca:31, exam:55, total:86, grade:'A', color:'green' },
    ],
    assessments:[
      { title:'Geography — Field Report',  date:'2025-03-20', score:83, outOf:100, type:'Project'   },
      { title:'Mathematics — Test 3',      date:'2025-03-17', score:82, outOf:100, type:'CA'        },
      { title:'English — Composition',     date:'2025-03-13', score:78, outOf:100, type:'CA'        },
      { title:'Computer Studies — Quiz',   date:'2025-03-09', score:86, outOf:100, type:'Quiz'      },
      { title:'Chemistry — Lab Report',    date:'2025-03-05', score:71, outOf:100, type:'Practical' },
    ],
    attendance_detail:{ present:18, absent:1, late:2, total:21,
      marchGrid:['present','holiday','present','present','present','holiday','holiday',
                 'present','present','late','present','present','holiday','holiday',
                 'present','present','present','absent','present','holiday','holiday',
                 'present','late','present','present','future','holiday','holiday'] },
    allTerms:[
      { term:'First Term',  session:'2024/2025', avg:77, rank:'10th', classSize:40 },
      { term:'Second Term', session:'2024/2025', avg:79, rank:'8th',  classSize:40 },
    ],
  },
  'SHC/008': {
    session:'2024/2025', term:'Second Term', avg:87, rank:'2nd', classSize:33, attendance:98, trend:'+0.5 this term',
    subjects:[
      { code:'MTH', name:'Mathematics',      teacher:'Mr Emeka Nwosu',   ca:32, exam:59, total:91, grade:'A', color:'green' },
      { code:'ENG', name:'English Language', teacher:'Mrs Ngozi Eze',    ca:31, exam:58, total:89, grade:'A', color:'green' },
      { code:'BSC', name:'Basic Science',    teacher:'Mrs Ifeoma Okeke', ca:29, exam:56, total:85, grade:'A', color:'green' },
      { code:'SST', name:'Social Studies',   teacher:'Mr Samuel Nnaji',  ca:28, exam:54, total:82, grade:'A', color:'green' },
      { code:'ART', name:'Creative Arts',    teacher:'Mr Chibuike Obi',  ca:35, exam:59, total:94, grade:'A', color:'green' },
      { code:'MUS', name:'Music',            teacher:'Mrs Adaora Nze',   ca:27, exam:53, total:80, grade:'A', color:'green' },
    ],
    assessments:[
      { title:'Creative Arts — Final Piece', date:'2025-03-21', score:94, outOf:100, type:'Project'    },
      { title:'Mathematics — CA Test 2',     date:'2025-03-17', score:91, outOf:100, type:'CA'         },
      { title:'English — Reading/Writing',   date:'2025-03-13', score:89, outOf:100, type:'CA'         },
      { title:'Basic Science — Test',        date:'2025-03-10', score:85, outOf:100, type:'CA'         },
      { title:'Music — Choir Recital',       date:'2025-03-06', score:80, outOf:100, type:'Practical'  },
    ],
    attendance_detail:{ present:20, absent:0, late:1, total:21,
      marchGrid:['present','holiday','present','present','present','holiday','holiday',
                 'present','present','present','present','late','holiday','holiday',
                 'present','present','present','present','present','holiday','holiday',
                 'present','present','present','present','future','holiday','holiday'] },
    allTerms:[
      { term:'First Term',  session:'2024/2025', avg:82, rank:'4th', classSize:33 },
      { term:'Second Term', session:'2024/2025', avg:87, rank:'2nd', classSize:33 },
    ],
  },
  'SHC/009': {
    session:'2024/2025', term:'Second Term', avg:76, rank:'10th', classSize:40, attendance:93, trend:'+0.2 this term',
    subjects:[
      { code:'MTH', name:'Mathematics',      teacher:'Mr Emeka Nwosu',   ca:27, exam:53, total:80, grade:'A', color:'green' },
      { code:'ENG', name:'English Language', teacher:'Mrs Ngozi Eze',    ca:25, exam:50, total:75, grade:'B', color:'gold'  },
      { code:'BIO', name:'Biology',          teacher:'Mrs Ifeoma Okeke', ca:26, exam:51, total:77, grade:'B', color:'gold'  },
      { code:'CHM', name:'Chemistry',        teacher:'Dr Chibuike Obi',  ca:21, exam:47, total:68, grade:'C', color:'rust'  },
      { code:'GEO', name:'Geography',        teacher:'Mr Samuel Nnaji',  ca:27, exam:52, total:79, grade:'B', color:'gold'  },
      { code:'CMP', name:'Computer Studies', teacher:'Mrs Adaora Nze',   ca:30, exam:54, total:84, grade:'A', color:'green' },
    ],
    assessments:[
      { title:'Computer Studies — Project', date:'2025-03-20', score:84, outOf:100, type:'Project'    },
      { title:'Mathematics — Mid-Term',     date:'2025-03-17', score:80, outOf:100, type:'Exam'       },
      { title:'Geography — Assignment',     date:'2025-03-13', score:79, outOf:100, type:'Assignment' },
      { title:'English — Oral Test',        date:'2025-03-09', score:75, outOf:100, type:'CA'         },
      { title:'Chemistry — Lab',            date:'2025-03-05', score:68, outOf:100, type:'Practical'  },
    ],
    attendance_detail:{ present:17, absent:2, late:2, total:21,
      marchGrid:['present','holiday','present','present','absent','holiday','holiday',
                 'present','late','present','present','present','holiday','holiday',
                 'present','present','present','absent','present','holiday','holiday',
                 'present','late','present','present','future','holiday','holiday'] },
    allTerms:[
      { term:'First Term',  session:'2024/2025', avg:74, rank:'12th', classSize:40 },
      { term:'Second Term', session:'2024/2025', avg:76, rank:'10th', classSize:40 },
    ],
  },
  'SHC/010': {
    session:'2024/2025', term:'Second Term', avg:88, rank:'2nd', classSize:36, attendance:97, trend:'+0.4 this term',
    subjects:[
      { code:'MTH', name:'Mathematics',      teacher:'Mr Emeka Nwosu',   ca:33, exam:59, total:92, grade:'A', color:'green' },
      { code:'ENG', name:'English Language', teacher:'Mrs Ngozi Eze',    ca:32, exam:58, total:90, grade:'A', color:'green' },
      { code:'BSC', name:'Basic Science',    teacher:'Mrs Ifeoma Okeke', ca:30, exam:56, total:86, grade:'A', color:'green' },
      { code:'SST', name:'Social Studies',   teacher:'Mr Samuel Nnaji',  ca:29, exam:56, total:85, grade:'A', color:'green' },
      { code:'ART', name:'Fine Arts',        teacher:'Mr Chibuike Obi',  ca:33, exam:58, total:91, grade:'A', color:'green' },
      { code:'BTH', name:'Basic Technology', teacher:'Mrs Adaora Nze',   ca:28, exam:52, total:80, grade:'A', color:'green' },
    ],
    assessments:[
      { title:'Fine Arts — Portfolio',      date:'2025-03-21', score:91, outOf:100, type:'Project'   },
      { title:'Mathematics — CA Test 2',    date:'2025-03-18', score:92, outOf:100, type:'CA'        },
      { title:'English — Essay',            date:'2025-03-13', score:90, outOf:100, type:'CA'        },
      { title:'Social Studies — Quiz',      date:'2025-03-10', score:85, outOf:100, type:'Quiz'      },
      { title:'Basic Science — Practical',  date:'2025-03-06', score:86, outOf:100, type:'Practical' },
    ],
    attendance_detail:{ present:20, absent:0, late:1, total:21,
      marchGrid:['present','holiday','present','present','present','holiday','holiday',
                 'present','present','present','present','late','holiday','holiday',
                 'present','present','present','present','present','holiday','holiday',
                 'present','present','present','present','future','holiday','holiday'] },
    allTerms:[
      { term:'First Term',  session:'2024/2025', avg:84, rank:'3rd', classSize:36 },
      { term:'Second Term', session:'2024/2025', avg:88, rank:'2nd', classSize:36 },
    ],
  },
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

/** Confirm the parent's session children include this studentId */
function _assertChildAccess(session, studentId, res) {
  if (session.role === 'Admin' || session.role === 'Teacher') return true;
  const ok = Array.isArray(session.children) &&
             session.children.some(c => c.studentId === studentId);
  if (!ok) {
    _forbidden(res, `You are not authorised to view records for student ${studentId}.`);
    return false;
  }
  return true;
}

function _fmtDate(iso) {
  const d = new Date(iso);
  return isNaN(d) ? iso : d.toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' });
}

function _scoreDot(score) {
  if (score >= 75) return 'green';
  if (score >= 50) return 'gold';
  return 'rust';
}

/* ─────────────────────────────────────────────────────────────
   CONTROLLER METHODS
───────────────────────────────────────────────────────────── */

/**
 * GET /api/parent-portal/children
 * Returns the list of children linked to the logged-in parent.
 */
exports.getChildren = (req, res) => {
  const session  = req.shcSession;
  const children = session.children || [];

  if (children.length === 0) {
    return _ok(res, [], { count: 0, message: 'No children linked to this account.' });
  }

  /* Enrich each child with the latest summary from ACADEMIC_DB */
  const enriched = children.map(c => {
    const db = ACADEMIC_DB[c.studentId];
    return {
      studentId:  c.studentId,
      name:       c.name,
      class:      c.class,
      arm:        c.arm,
      gender:     c.gender,
      avg:        db ? db.avg        : null,
      rank:       db ? db.rank       : null,
      attendance: db ? `${db.attendance}%` : null,
      trend:      db ? db.trend      : null,
      session:    db ? db.session    : null,
      term:       db ? db.term       : null,
    };
  });

  return _ok(res, enriched, { count: enriched.length });
};

/**
 * GET /api/parent-portal/summary/:studentId
 * Stat-card data: avg, rank, attendance, trend.
 */
exports.getStudentSummary = (req, res) => {
  const { studentId } = req.params;
  if (!_assertChildAccess(req.shcSession, studentId, res)) return;

  const student = STUDENTS[studentId];
  if (!student) return _notFound(res, `Student ${studentId} not found.`);

  const db = ACADEMIC_DB[studentId];
  if (!db)  return _notFound(res, `No academic data found for ${studentId}.`);

  return _ok(res, {
    studentId,
    name:       student.name,
    class:      student.class,
    arm:        student.arm,
    gender:     student.gender,
    avg:        db.avg,
    rank:       db.rank,
    classSize:  db.classSize,
    attendance: `${db.attendance}%`,
    trend:      db.trend,
    session:    req.query.session || db.session,
    term:       req.query.term    || db.term,
  });
};

/**
 * GET /api/parent-portal/subjects/:studentId
 * Subject cards: name, teacher, score, grade, colour, progress.
 */
exports.getSubjectScores = (req, res) => {
  const { studentId } = req.params;
  if (!_assertChildAccess(req.shcSession, studentId, res)) return;

  const student = STUDENTS[studentId];
  if (!student) return _notFound(res, `Student ${studentId} not found.`);

  const db = ACADEMIC_DB[studentId];
  if (!db)  return _notFound(res, `No academic data found for ${studentId}.`);

  const subjects = db.subjects.map(s => ({
    code:       s.code,
    name:       s.name,
    teacher:    s.teacher,
    ca:         s.ca,
    exam:       s.exam,
    total:      s.total,
    grade:      s.grade,
    color:      s.color,
    progressPct: s.total,   // same as total, named for clarity in the template
    checkResultUrl: `/checkResult.html?student=${encodeURIComponent(student.name)}&id=${studentId}&subject=${encodeURIComponent(s.name)}`,
  }));

  return _ok(res, { studentId, studentName: student.name, subjects }, { count: subjects.length });
};

/**
 * GET /api/parent-portal/attendance/:studentId
 * Attendance counts + march calendar grid.
 */
exports.getAttendance = (req, res) => {
  const { studentId } = req.params;
  if (!_assertChildAccess(req.shcSession, studentId, res)) return;

  const db = ACADEMIC_DB[studentId];
  if (!db) return _notFound(res, `No academic data found for ${studentId}.`);

  const att = db.attendance_detail;

  return _ok(res, {
    studentId,
    present:         att.present,
    absent:          att.absent,
    late:            att.late,
    totalSchoolDays: att.total,
    percentage:      `${Math.round((att.present / att.total) * 100)}%`,
    marchGrid:       att.marchGrid,
    month:           'March 2025',
  });
};

/**
 * GET /api/parent-portal/recent-assessments/:studentId
 * Last N assessments, enriched with dot colour + formatted date.
 */
exports.getRecentAssessments = (req, res) => {
  const { studentId } = req.params;
  if (!_assertChildAccess(req.shcSession, studentId, res)) return;

  const db = ACADEMIC_DB[studentId];
  if (!db) return _notFound(res, `No academic data found for ${studentId}.`);

  const limit = Math.min(parseInt(req.query.limit) || 5, 20);
  let list    = [...db.assessments];

  if (req.query.subject) {
    const f = req.query.subject.toLowerCase();
    list = list.filter(a => a.title.toLowerCase().includes(f));
  }

  list = list.slice(0, limit).map(a => ({
    ...a,
    dot:           _scoreDot(a.score),
    displayScore:  `${a.score}/${a.outOf}`,
    dateFormatted: _fmtDate(a.date),
    checkResultUrl:`/checkResult.html?id=${studentId}&subject=${encodeURIComponent(a.title.split('—')[0].trim())}`,
  }));

  return _ok(res, { studentId, assessments: list }, { count: list.length });
};

/**
 * GET /api/parent-portal/all-terms/:studentId
 * Year-on-year: avg + position per term.
 */
exports.getAllTermsResult = (req, res) => {
  const { studentId } = req.params;
  if (!_assertChildAccess(req.shcSession, studentId, res)) return;

  const db = ACADEMIC_DB[studentId];
  if (!db) return _notFound(res, `No academic data found for ${studentId}.`);

  return _ok(res, {
    studentId,
    studentName: STUDENTS[studentId]?.name || studentId,
    history:     db.allTerms,
  }, { count: db.allTerms.length });
};