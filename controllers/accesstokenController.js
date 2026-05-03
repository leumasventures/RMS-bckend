'use strict';

const db     = require('../config/db');
const crypto = require('crypto');

/* ══════════════════════════════════════════════════════════════════════════════
   CONSTANTS  —  mirror TOKEN_CONFIG from the frontend exactly
══════════════════════════════════════════════════════════════════════════════ */
const TOKEN_CONFIG = {
  length:     8,
  expiryDays: 30,
  maxUses:    null,   // null = unlimited
  prefix:     'RC',
};

// Characters used in code generation — no confusable chars (0, O, I, 1)
const TOKEN_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/* ══════════════════════════════════════════════════════════════════════════════
   SHARED HELPERS
══════════════════════════════════════════════════════════════════════════════ */

/** Crypto-safe random code — format: RC-XXXX-XXXX */
function generateCode() {
  const bytes = crypto.randomBytes(TOKEN_CONFIG.length);
  const raw   = Array.from(bytes)
    .map(b => TOKEN_CHARS[b % TOKEN_CHARS.length])
    .join('');
  return `${TOKEN_CONFIG.prefix}-${raw.slice(0, 4)}-${raw.slice(4)}`;
}

/** Normalise a code string the same way the frontend does */
function normaliseCode(code) {
  return String(code || '').trim().toUpperCase().replace(/\s+/g, '');
}

/** Ensure db collections exist */
function ensureStore() {
  if (!db.accessTokens)      db.accessTokens      = {};  // code → token record
  if (!db.studentTokenIndex) db.studentTokenIndex = {};  // studentId → [codes]
  return { tokens: db.accessTokens, index: db.studentTokenIndex };
}

/** Check whether a token is currently usable */
function tokenStatus(token) {
  if (token.revoked) return 'revoked';
  if (new Date() > new Date(token.expiresAt)) return 'expired';
  if (token.maxUses !== null && token.useCount >= token.maxUses) return 'exhausted';
  return 'active';
}

/** Index a new code under its student */
function indexToken(studentId, code) {
  const { index } = ensureStore();
  if (!index[studentId]) index[studentId] = [];
  if (!index[studentId].includes(code)) index[studentId].push(code);
}

/**
 * Build a single token record.
 * Mirrors generateAccessToken() in the frontend.
 */
function buildToken(student, options, createdBy) {
  const expiryDays = options.expiryDays ?? TOKEN_CONFIG.expiryDays;
  const expiresAt  = new Date();
  expiresAt.setDate(expiresAt.getDate() + expiryDays);

  const code = generateCode();
  return {
    code,
    studentId:   student.id,
    studentName: student.name,
    class:       student.class,
    arm:         student.arm,
    label:       options.label || `${student.name} — ${options.term || 'All Terms'} ${options.session || ''}`.trim(),
    term:        options.term    || null,
    session:     options.session || null,
    createdAt:   new Date().toISOString(),
    expiresAt:   expiresAt.toISOString(),
    maxUses:     options.maxUses ?? TOKEN_CONFIG.maxUses,
    useCount:    0,
    revoked:     false,
    createdBy,
    auditLog:    [{ action: 'created', at: new Date().toISOString(), by: createdBy }],
  };
}

/* ══════════════════════════════════════════════════════════════════════════════
   GET /api/access-tokens
   Query: studentId, class, arm, status (active|expired|revoked|exhausted)
   Admin / Teacher → can query any. Teacher → restricted to their class/arm.
══════════════════════════════════════════════════════════════════════════════ */
exports.getAll = (req, res) => {
  const { studentId, class: cls, arm, status } = req.query;
  const { tokens } = ensureStore();

  let list = Object.values(tokens);

  // Teacher: restrict to assigned class/arm
  if (req.user.role === 'Teacher') {
    list = list.filter(t =>
      t.class === req.user.assignedClass &&
      t.arm   === req.user.assignedArm
    );
  }

  if (studentId) list = list.filter(t => t.studentId === studentId);
  if (cls)       list = list.filter(t => t.class     === cls);
  if (arm)       list = list.filter(t => t.arm       === arm);
  if (status)    list = list.filter(t => tokenStatus(t) === status);

  // Enrich with computed status
  const data = list
    .map(t => ({ ...t, status: tokenStatus(t) }))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  return res.json({ success: true, data, total: data.length });
};

/* ══════════════════════════════════════════════════════════════════════════════
   GET /api/access-tokens/student/:studentId
   Returns all tokens for one student (matches getStudentTokens() in frontend).
   Admin/Teacher (assigned class) and the student's own Parent can call this.
══════════════════════════════════════════════════════════════════════════════ */
exports.getByStudent = (req, res) => {
  const { studentId } = req.params;
  const { tokens, index } = ensureStore();

  const student = db.findStudent(studentId);
  if (!student)
    return res.status(404).json({ success: false, message: `Student "${studentId}" not found.` });

  // Parent: own ward only
  if (req.user.role === 'Parent' && req.user.wardId !== studentId)
    return res.status(403).json({ success: false, message: 'Access denied.' });

  // Teacher: assigned class/arm only
  if (req.user.role === 'Teacher' &&
      !(req.user.assignedClass === student.class && req.user.assignedArm === student.arm))
    return res.status(403).json({ success: false, message: 'Access denied.' });

  const codes = index[studentId] || [];
  const data  = codes
    .map(c => tokens[c])
    .filter(Boolean)
    .map(t => ({ ...t, status: tokenStatus(t) }))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  return res.json({ success: true, data, total: data.length });
};

/* ══════════════════════════════════════════════════════════════════════════════
   GET /api/access-tokens/class-list
   Query: class*, arm*
   Returns one row per student with their latest active token.
   Powers openTokenListModal() — the class-level token view.
══════════════════════════════════════════════════════════════════════════════ */
exports.getClassList = (req, res) => {
  const { class: cls, arm } = req.query;

  if (!cls || !arm)
    return res.status(400).json({ success: false, message: 'class and arm are required.' });

  if (req.user.role === 'Teacher' &&
      !(req.user.assignedClass === cls && req.user.assignedArm === arm))
    return res.status(403).json({ success: false, message: 'Access denied.' });

  const { tokens, index } = ensureStore();
  const students = (db.students || []).filter(s => s.class === cls && s.arm === arm);

  const data = students.map(s => {
    const codes  = (index[s.id] || []).map(c => tokens[c]).filter(Boolean);
    const active = codes
      .filter(t => tokenStatus(t) === 'active')
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    const latest = active[0] || null;

    return {
      studentId:   s.id,
      studentName: s.name,
      class:       s.class,
      arm:         s.arm,
      activeCount: active.length,
      totalCount:  codes.length,
      latestCode:  latest?.code        || null,
      expiresAt:   latest?.expiresAt   || null,
      status:      latest ? 'active' : codes.length ? 'no active code' : 'none',
    };
  });

  return res.json({ success: true, class: cls, arm, data, total: data.length });
};

/* ══════════════════════════════════════════════════════════════════════════════
   POST /api/access-tokens
   Generate a token for a single student.
   Body: { studentId*, expiryDays?, term?, session?, maxUses?, label? }
   Mirrors openSingleTokenModal → confirmGenerateSingleToken → generateAccessToken().
══════════════════════════════════════════════════════════════════════════════ */
exports.generate = (req, res) => {
  const { studentId, expiryDays, term, session, maxUses, label } = req.body;

  if (!studentId)
    return res.status(400).json({ success: false, message: 'studentId is required.' });

  const student = db.findStudent(studentId);
  if (!student)
    return res.status(404).json({ success: false, message: `Student "${studentId}" not found.` });

  // Teacher: can only generate for their assigned class/arm
  if (req.user.role === 'Teacher' &&
      !(req.user.assignedClass === student.class && req.user.assignedArm === student.arm))
    return res.status(403).json({ success: false, message: 'You can only generate tokens for your assigned class/arm.' });

  if (expiryDays !== undefined) {
    const n = Number(expiryDays);
    if (isNaN(n) || n < 1 || n > 365)
      return res.status(400).json({ success: false, message: 'expiryDays must be between 1 and 365.' });
  }

  if (maxUses !== undefined && maxUses !== null) {
    const n = Number(maxUses);
    if (isNaN(n) || n < 1)
      return res.status(400).json({ success: false, message: 'maxUses must be a positive integer.' });
  }

  const { tokens } = ensureStore();
  const createdBy  = req.user.name || req.user.id || 'System';
  const token      = buildToken(student, {
    expiryDays: expiryDays ? Number(expiryDays) : undefined,
    term:       term    || null,
    session:    session || null,
    maxUses:    maxUses != null ? Number(maxUses) : null,
    label,
  }, createdBy);

  tokens[token.code] = token;
  indexToken(studentId, token.code);

  return res.status(201).json({ success: true, data: { ...token, status: 'active' } });
};

/* ══════════════════════════════════════════════════════════════════════════════
   POST /api/access-tokens/bulk
   Bulk generate for a class/arm.
   Body: { class*, arm*, expiryDays?, term?, session?, maxUses? }
   Mirrors openBulkTokenModal → confirmBulkTokenGenerate → bulkGenerateTokens().
══════════════════════════════════════════════════════════════════════════════ */
exports.bulkGenerate = (req, res) => {
  const { class: cls, arm, expiryDays, term, session, maxUses } = req.body;

  if (!cls || !arm)
    return res.status(400).json({ success: false, message: 'class and arm are required.' });

  if (req.user.role === 'Teacher' &&
      !(req.user.assignedClass === cls && req.user.assignedArm === arm))
    return res.status(403).json({ success: false, message: 'You can only generate tokens for your assigned class/arm.' });

  const students = (db.students || []).filter(s => s.class === cls && s.arm === arm);
  if (!students.length)
    return res.status(404).json({ success: false, message: `No students found in ${cls} ${arm}.` });

  if (expiryDays !== undefined) {
    const n = Number(expiryDays);
    if (isNaN(n) || n < 1 || n > 365)
      return res.status(400).json({ success: false, message: 'expiryDays must be between 1 and 365.' });
  }

  const { tokens } = ensureStore();
  const createdBy  = req.user.name || req.user.id || 'System';
  const options    = {
    expiryDays: expiryDays ? Number(expiryDays) : undefined,
    term:       term    || null,
    session:    session || null,
    maxUses:    maxUses != null ? Number(maxUses) : null,
  };

  const succeeded = [];
  const failed    = [];

  students.forEach(s => {
    try {
      const token = buildToken(s, options, createdBy);
      tokens[token.code] = token;
      indexToken(s.id, token.code);
      succeeded.push({ studentId: s.id, studentName: s.name, token: { ...token, status: 'active' } });
    } catch (err) {
      failed.push({ studentId: s.id, studentName: s.name, error: err.message });
    }
  });

  return res.status(succeeded.length === 0 ? 400 : 207).json({
    success:   succeeded.length > 0,
    generated: succeeded.length,
    errors:    failed.length,
    data:      succeeded,
    issues:    failed,
  });
};

/* ══════════════════════════════════════════════════════════════════════════════
   POST /api/access-tokens/validate
   Public endpoint — called from the parent check-result portal.
   Body: { code* }
   Mirrors validateAccessToken() including use-count increment and audit log.
   Does NOT require authentication (parents have no account).
══════════════════════════════════════════════════════════════════════════════ */
exports.validate = (req, res) => {
  const raw  = req.body?.code;
  if (!raw)
    return res.status(400).json({ success: false, message: 'code is required.' });

  const code = normaliseCode(raw);
  const { tokens } = ensureStore();
  const token = tokens[code];

  if (!token)
    return res.status(404).json({ success: false, valid: false, reason: 'Code not found. Please check and try again.' });

  const status = tokenStatus(token);

  if (status === 'revoked')
    return res.status(403).json({ success: false, valid: false, reason: 'This access code has been revoked.' });

  if (status === 'expired')
    return res.status(403).json({
      success: false, valid: false,
      reason: `This code expired on ${new Date(token.expiresAt).toLocaleDateString('en-NG', { day:'numeric', month:'short', year:'numeric' })}.`,
    });

  if (status === 'exhausted')
    return res.status(403).json({ success: false, valid: false, reason: 'This code has already been used the maximum number of times.' });

  // Consume: increment use-count and append audit log entry
  token.useCount++;
  token.auditLog.push({
    action: 'used',
    at:     new Date().toISOString(),
    ua:     (req.headers['user-agent'] || '').slice(0, 80),
    ip:     req.ip || null,
  });

  // Fetch the student's results scoped to the token's term/session
  const student = db.findStudent(token.studentId);
  let results   = (db.results || []).filter(r => r.studentId === token.studentId);
  if (token.term)    results = results.filter(r => r.term    === token.term);
  if (token.session) results = results.filter(r => r.session === token.session);

  // Fetch remarks (read-only on the portal)
  const remarkEntry = (db.remarks || []).find(r =>
    r.studentId === token.studentId &&
    (!token.term    || r.term    === token.term) &&
    (!token.session || r.session === token.session)
  ) || {};

  return res.json({
    success: true,
    valid:   true,
    token: {
      code:        token.code,
      studentId:   token.studentId,
      studentName: token.studentName,
      term:        token.term,
      session:     token.session,
      expiresAt:   token.expiresAt,
      useCount:    token.useCount,
      maxUses:     token.maxUses,
    },
    student,
    results,
    remarks: {
      teacherRemark:   remarkEntry.teacherRemark   || null,
      principalRemark: remarkEntry.principalRemark || null,
    },
    school: db.schoolInfo || {},
  });
};

/* ══════════════════════════════════════════════════════════════════════════════
   GET /api/access-tokens/:code
   Fetch a single token record by code.
   Admin / Teacher (assigned class) only.
══════════════════════════════════════════════════════════════════════════════ */
exports.getOne = (req, res) => {
  const code  = normaliseCode(req.params.code);
  const { tokens } = ensureStore();
  const token = tokens[code];

  if (!token)
    return res.status(404).json({ success: false, message: `Token "${code}" not found.` });

  if (req.user.role === 'Teacher' &&
      !(req.user.assignedClass === token.class && req.user.assignedArm === token.arm))
    return res.status(403).json({ success: false, message: 'Access denied.' });

  return res.json({ success: true, data: { ...token, status: tokenStatus(token) } });
};

/* ══════════════════════════════════════════════════════════════════════════════
   PATCH /api/access-tokens/:code/revoke  —  Admin or assigned Teacher
   Mirrors revokeAccessToken() in the frontend.
   No body required.
══════════════════════════════════════════════════════════════════════════════ */
exports.revoke = (req, res) => {
  const code  = normaliseCode(req.params.code);
  const { tokens } = ensureStore();
  const token = tokens[code];

  if (!token)
    return res.status(404).json({ success: false, message: `Token "${code}" not found.` });

  if (req.user.role === 'Teacher' &&
      !(req.user.assignedClass === token.class && req.user.assignedArm === token.arm))
    return res.status(403).json({ success: false, message: 'You can only revoke tokens for your assigned class/arm.' });

  if (token.revoked)
    return res.status(409).json({ success: false, message: 'Token is already revoked.' });

  const revokedAt = new Date().toISOString();
  const revokedBy = req.user.name || req.user.id || 'System';

  token.revoked   = true;
  token.revokedAt = revokedAt;
  token.revokedBy = revokedBy;
  token.auditLog.push({ action: 'revoked', at: revokedAt, by: revokedBy });

  return res.json({ success: true, message: `Token "${code}" revoked.`, data: { ...token, status: 'revoked' } });
};

/* ══════════════════════════════════════════════════════════════════════════════
   POST /api/access-tokens/:code/revoke  —  alias for PATCH
   The frontend's revokeAndRefresh() doesn't specify a method, so support both.
══════════════════════════════════════════════════════════════════════════════ */
exports.revokePost = exports.revoke;

/* ══════════════════════════════════════════════════════════════════════════════
   DELETE /api/access-tokens/:code  —  Admin only
   Hard-deletes a token record and removes it from the student index.
   Use sparingly — prefer revoke for audit trail preservation.
══════════════════════════════════════════════════════════════════════════════ */
exports.remove = (req, res) => {
  const code  = normaliseCode(req.params.code);
  const { tokens, index } = ensureStore();
  const token = tokens[code];

  if (!token)
    return res.status(404).json({ success: false, message: `Token "${code}" not found.` });

  // Remove from student index
  if (index[token.studentId]) {
    index[token.studentId] = index[token.studentId].filter(c => c !== code);
  }

  delete tokens[code];
  return res.json({ success: true, message: `Token "${code}" permanently deleted.`, data: token });
};

/* ══════════════════════════════════════════════════════════════════════════════
   GET /api/access-tokens/export/csv
   Query: class*, arm*
   Returns CSV data for downloadTokensCSV() — one row per student, latest
   active code, expiry, and the portal URL.
══════════════════════════════════════════════════════════════════════════════ */
exports.exportCSV = (req, res) => {
  const { class: cls, arm } = req.query;

  if (!cls || !arm)
    return res.status(400).json({ success: false, message: 'class and arm are required.' });

  if (req.user.role === 'Teacher' &&
      !(req.user.assignedClass === cls && req.user.assignedArm === arm))
    return res.status(403).json({ success: false, message: 'Access denied.' });

  const { tokens, index } = ensureStore();
  const students  = (db.students || []).filter(s => s.class === cls && s.arm === arm);
  const portalBase = `${process.env.PORTAL_URL || 'https://yourschool.edu.ng'}/check-result.html?code=`;

  const rows = [['Student Name', 'Student ID', 'Class', 'Arm', 'Access Code', 'Expires', 'Portal Link']];
  students.forEach(s => {
    const codes  = (index[s.id] || []).map(c => tokens[c]).filter(Boolean);
    const active = codes
      .filter(t => tokenStatus(t) === 'active')
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    const latest = active[0];
    rows.push([
      s.name, s.id, s.class, s.arm,
      latest?.code || 'No active code',
      latest ? new Date(latest.expiresAt).toISOString().split('T')[0] : '—',
      latest ? `${portalBase}${latest.code}` : '—',
    ]);
  });

  const csv = rows
    .map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
    .join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="tokens_${cls}_${arm}_${Date.now()}.csv"`);
  return res.send(csv);
};