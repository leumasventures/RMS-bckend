'use strict';

/**
 * accessTokenController.js — Sacred Heart College (SAHARCO)
 *
 * Routes (wired in accessTokenRoutes.js):
 *   GET    /api/access-tokens                          getAll
 *   GET    /api/access-tokens/student/:studentId       getByStudent
 *   GET    /api/access-tokens/class-list               getClassList
 *   GET    /api/access-tokens/export/csv               exportCSV
 *   GET    /api/access-tokens/:code                    getOne
 *   POST   /api/access-tokens                          generate       (single)
 *   POST   /api/access-tokens/bulk                     bulkGenerate
 *   POST   /api/access-tokens/validate                 validate       (public — no auth)
 *   PATCH  /api/access-tokens/:code/revoke             revoke
 *   POST   /api/access-tokens/:code/revoke             revokePost     (alias)
 *   DELETE /api/access-tokens/:code                    remove
 *
 * Storage layout  (in-memory db, persisted to settings JSON):
 *   db.accessTokens       = { [code]: tokenRecord }
 *   db.studentTokenIndex  = { [studentId]: [code, ...] }
 *
 * Token fields align with:
 *   • generateParentToken() / apiGenerateParentToken() in api-bridge.js
 *   • validateParentToken() / apiMarkTokenUsed() in api-bridge.js
 *   • _renderParentReportCard() in script3.js
 */

const db     = require('../config/db');
const crypto = require('crypto');

/* ─── constants ─────────────────────────────────────────────────────────── */

const TOKEN_CONFIG = {
  length:     8,
  expiryDays: 30,
  maxUses:    null,   // null = unlimited
  prefix:     'SHC-PRC', // matches frontend generateParentToken() pattern
};

// Unambiguous character set — no 0/O/I/1 confusion
const TOKEN_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/* ─── helpers ────────────────────────────────────────────────────────────── */

const fail = (res, status, msg, extra = {}) =>
  res.status(status).json({ success: false, message: msg, ...extra });

const ok = (res, data, meta = {}, status = 200) =>
  res.status(status).json({ success: true, ...meta, data });

/**
 * Generate a crypto-safe token matching the frontend pattern:
 *   SHC-PRC-YYYY-XXXXXX
 * where XXXXXX is 6 unambiguous uppercase chars.
 */
function generateCode() {
  const year  = new Date().getFullYear();
  const bytes = crypto.randomBytes(6);
  const raw   = Array.from(bytes)
    .map(b => TOKEN_CHARS[b % TOKEN_CHARS.length])
    .join('');
  return `${TOKEN_CONFIG.prefix}-${year}-${raw}`;
}

/** Normalise a code — uppercase, strip spaces, match frontend toUpperCase().trim() */
function normaliseCode(code) {
  return String(code || '').trim().toUpperCase().replace(/\s+/g, '');
}

function ensureStore() {
  if (!db.accessTokens)      db.accessTokens      = {};
  if (!db.studentTokenIndex) db.studentTokenIndex = {};
  return { tokens: db.accessTokens, index: db.studentTokenIndex };
}

/**
 * Compute the current status of a token.
 * Mirrors the logic in validateParentToken() on the frontend.
 */
function tokenStatus(token) {
  if (token.revoked)                                         return 'revoked';
  if (new Date() > new Date(token.expires ?? token.expiresAt)) return 'expired';
  if (token.maxUses !== null && token.used >= token.maxUses) return 'exhausted';
  return 'active';
}

function indexToken(studentId, code) {
  const { index } = ensureStore();
  if (!index[studentId]) index[studentId] = [];
  if (!index[studentId].includes(code)) index[studentId].push(code);
}

/**
 * Build a token record.
 * Field names are dual-keyed ('expires' + 'expiresAt') so both the
 * frontend api-bridge (uses 'expires') and internal tokenStatus
 * (uses either) work without transform.
 */
function buildToken(student, options, createdBy) {
  const days      = options.expiryDays ?? TOKEN_CONFIG.expiryDays;
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + days);
  const isoExpiry = expiresAt.toISOString();

  const code = generateCode();

  return {
    // Identification
    code,
    token:       code,  // alias — api-bridge stores as { token }
    // Student
    studentId:   student.id,
    studentName: student.name,
    class:       student.class,
    arm:         student.arm,
    // Scope
    label:   options.label   || `${student.name} — ${options.term || 'All Terms'} ${options.session || ''}`.trim(),
    term:    options.term    || null,
    session: options.session || null,
    // Lifecycle — dual field names
    createdAt:  new Date().toISOString(),
    created:    new Date().toISOString(),
    expires:    isoExpiry,
    expiresAt:  isoExpiry,
    maxUses:    options.maxUses ?? TOKEN_CONFIG.maxUses,
    used:       0,         // api-bridge increments this via apiMarkTokenUsed
    useCount:   0,         // alias
    revoked:    false,
    createdBy,
    auditLog: [{ action: 'created', at: new Date().toISOString(), by: createdBy }],
  };
}

/* ─── role guards ────────────────────────────────────────────────────────── */

function canActOnClass(user, cls, arm) {
  if (user.role === 'Admin') return true;
  return (
    user.role === 'Teacher' &&
    user.assignedClass === cls &&
    (!user.assignedArm || user.assignedArm === arm)
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   GET /api/access-tokens
   Query: studentId, class, arm, status (active|expired|revoked|exhausted)
═══════════════════════════════════════════════════════════════════════════ */
exports.getAll = (req, res) => {
  const { studentId, class: cls, arm, status } = req.query;
  const { tokens } = ensureStore();

  let list = Object.values(tokens);

  if (req.user.role === 'Teacher') {
    list = list.filter(t => canActOnClass(req.user, t.class, t.arm));
  }

  if (studentId) list = list.filter(t => t.studentId === studentId);
  if (cls)       list = list.filter(t => t.class     === cls);
  if (arm)       list = list.filter(t => t.arm       === arm);
  if (status)    list = list.filter(t => tokenStatus(t) === status);

  const data = list
    .map(t => ({ ...t, status: tokenStatus(t) }))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  return ok(res, data, { total: data.length });
};

/* ═══════════════════════════════════════════════════════════════════════════
   GET /api/access-tokens/student/:studentId
   Returns all tokens for one student.
   Parent → own ward only.
═══════════════════════════════════════════════════════════════════════════ */
exports.getByStudent = (req, res) => {
  const { studentId }          = req.params;
  const { tokens, index }      = ensureStore();

  const student = db.findStudent(studentId);
  if (!student) return fail(res, 404, `Student "${studentId}" not found.`);

  if (req.user.role === 'Parent' && req.user.wardId !== studentId)
    return fail(res, 403, 'Access denied.');

  if (req.user.role === 'Teacher' && !canActOnClass(req.user, student.class, student.arm))
    return fail(res, 403, 'Access denied.');

  const codes = index[studentId] || [];
  const data  = codes
    .map(c => tokens[c])
    .filter(Boolean)
    .map(t => ({ ...t, status: tokenStatus(t) }))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  return ok(res, data, { total: data.length });
};

/* ═══════════════════════════════════════════════════════════════════════════
   GET /api/access-tokens/class-list
   Query: class*, arm*
   One row per student with their latest active token.
   Powers the class-level token management view.
═══════════════════════════════════════════════════════════════════════════ */
exports.getClassList = (req, res) => {
  const { class: cls, arm } = req.query;
  if (!cls || !arm) return fail(res, 400, 'class and arm are required.');

  if (!canActOnClass(req.user, cls, arm))
    return fail(res, 403, 'Access denied.');

  const { tokens, index } = ensureStore();
  const students          = (db.students || []).filter(s =>
    s.class === cls && s.arm === arm && s.active !== false
  );

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
      latestCode:  latest?.code      || null,
      expiresAt:   latest?.expiresAt || null,
      status:      latest ? 'active' : codes.length ? 'no active code' : 'none',
    };
  });

  return ok(res, data, { class: cls, arm, total: data.length });
};

/* ═══════════════════════════════════════════════════════════════════════════
   POST /api/access-tokens
   Generate a token for a single student.
   Body: { studentId*, expiryDays?, term?, session?, maxUses?, label? }
   Mirrors apiGenerateParentToken() in api-bridge.js.
═══════════════════════════════════════════════════════════════════════════ */
exports.generate = (req, res) => {
  const { studentId, expiryDays, term, session, maxUses, label } = req.body;

  if (!studentId) return fail(res, 400, 'studentId is required.');

  const student = db.findStudent(studentId);
  if (!student) return fail(res, 404, `Student "${studentId}" not found.`);

  if (!canActOnClass(req.user, student.class, student.arm))
    return fail(res, 403, 'You can only generate tokens for your assigned class/arm.');

  if (expiryDays !== undefined) {
    const n = Number(expiryDays);
    if (isNaN(n) || n < 1 || n > 365)
      return fail(res, 400, 'expiryDays must be between 1 and 365.');
  }
  if (maxUses !== undefined && maxUses !== null) {
    const n = Number(maxUses);
    if (isNaN(n) || n < 1)
      return fail(res, 400, 'maxUses must be a positive integer.');
  }

  const { tokens } = ensureStore();
  const createdBy  = req.user.name || req.user.id || 'System';

  const tokenRecord = buildToken(student, {
    expiryDays: expiryDays ? Number(expiryDays) : undefined,
    term:       term    || null,
    session:    session || null,
    maxUses:    maxUses != null ? Number(maxUses) : null,
    label,
  }, createdBy);

  tokens[tokenRecord.code] = tokenRecord;
  indexToken(studentId, tokenRecord.code);

  // Also update App.data.parentTokens array format so api-bridge cache matches
  if (!db.parentTokens) db.parentTokens = [];
  db.parentTokens = db.parentTokens.filter(t => t.studentId !== studentId);
  db.parentTokens.push({
    token:     tokenRecord.code,
    studentId: student.id,
    created:   tokenRecord.createdAt,
    expires:   tokenRecord.expiresAt,
    used:      false,
  });

  return ok(res, { ...tokenRecord, status: 'active' }, {}, 201);
};

/* ═══════════════════════════════════════════════════════════════════════════
   POST /api/access-tokens/bulk
   Body: { class*, arm*, expiryDays?, term?, session?, maxUses? }
   Generates one token per student in the class/arm.
═══════════════════════════════════════════════════════════════════════════ */
exports.bulkGenerate = (req, res) => {
  const { class: cls, arm, expiryDays, term, session, maxUses } = req.body;

  if (!cls || !arm) return fail(res, 400, 'class and arm are required.');

  if (!canActOnClass(req.user, cls, arm))
    return fail(res, 403, 'You can only generate tokens for your assigned class/arm.');

  const students = (db.students || []).filter(s =>
    s.class === cls && s.arm === arm && s.active !== false
  );
  if (!students.length)
    return fail(res, 404, `No students found in ${cls} ${arm}.`);

  if (expiryDays !== undefined) {
    const n = Number(expiryDays);
    if (isNaN(n) || n < 1 || n > 365)
      return fail(res, 400, 'expiryDays must be between 1 and 365.');
  }

  const { tokens } = ensureStore();
  const createdBy  = req.user.name || req.user.id || 'System';
  const options    = {
    expiryDays: expiryDays ? Number(expiryDays) : undefined,
    term:       term    || null,
    session:    session || null,
    maxUses:    maxUses != null ? Number(maxUses) : null,
  };

  const succeeded = [], failed = [];

  students.forEach(s => {
    try {
      const tokenRecord = buildToken(s, options, createdBy);
      tokens[tokenRecord.code] = tokenRecord;
      indexToken(s.id, tokenRecord.code);

      if (!db.parentTokens) db.parentTokens = [];
      db.parentTokens = db.parentTokens.filter(t => t.studentId !== s.id);
      db.parentTokens.push({
        token: tokenRecord.code, studentId: s.id,
        created: tokenRecord.createdAt, expires: tokenRecord.expiresAt, used: false,
      });

      succeeded.push({ studentId: s.id, studentName: s.name, token: { ...tokenRecord, status: 'active' } });
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

/* ═══════════════════════════════════════════════════════════════════════════
   POST /api/access-tokens/validate   ← PUBLIC — no auth middleware
   Body: { code* }
   Called from check-result.html / parent portal.
   Mirrors validateParentToken() + apiMarkTokenUsed() in api-bridge.js.
═══════════════════════════════════════════════════════════════════════════ */
exports.validate = (req, res) => {
  const raw = req.body?.code;
  if (!raw) return fail(res, 400, 'code is required.');

  const code           = normaliseCode(raw);
  const { tokens }     = ensureStore();
  const tokenRecord    = tokens[code];

  // Also check the simpler parentTokens array (written by api-bridge)
  const legacyRecord   = !tokenRecord
    ? (db.parentTokens || []).find(t => normaliseCode(t.token) === code)
    : null;

  if (!tokenRecord && !legacyRecord)
    return fail(res, 404, 'Code not found. Please check and try again.', { valid: false, reason: 'Code not found.' });

  if (tokenRecord) {
    const status = tokenStatus(tokenRecord);

    if (status === 'revoked')
      return fail(res, 403, 'This access code has been revoked.', { valid: false, reason: 'revoked' });

    if (status === 'expired')
      return fail(res, 403,
        `This code expired on ${new Date(tokenRecord.expiresAt).toLocaleDateString('en-NG', { day:'numeric', month:'short', year:'numeric' })}.`,
        { valid: false, reason: 'expired' }
      );

    if (status === 'exhausted')
      return fail(res, 403, 'This code has already been used the maximum number of times.', { valid: false, reason: 'exhausted' });

    // Consume
    tokenRecord.used++;
    tokenRecord.useCount++;
    tokenRecord.auditLog.push({
      action: 'used',
      at:     new Date().toISOString(),
      ua:     (req.headers['user-agent'] || '').slice(0, 80),
      ip:     req.ip || null,
    });

    // Mirror api-bridge: mark legacy record too
    const legacy = (db.parentTokens || []).find(t => normaliseCode(t.token) === code);
    if (legacy) { legacy.used = true; legacy.lastAccessed = new Date().toISOString(); }

    return _buildValidateResponse(res, tokenRecord);
  }

  // Legacy path (token stored by api-bridge but not full token controller record)
  if (legacyRecord.expires && new Date(legacyRecord.expires) < new Date())
    return fail(res, 403, 'This code has expired.', { valid: false, reason: 'expired' });

  legacyRecord.used = true;
  legacyRecord.lastAccessed = new Date().toISOString();

  const student = db.findStudent(legacyRecord.studentId);
  if (!student) return fail(res, 404, 'Student record not found.', { valid: false });

  return _buildValidateResponse(res, {
    code,
    studentId:   legacyRecord.studentId,
    studentName: student.name,
    term:        null,
    session:     null,
    expiresAt:   legacyRecord.expires,
    used:        1,
    maxUses:     null,
  });
};

function _buildValidateResponse(res, tokenRecord) {
  const student = db.findStudent(tokenRecord.studentId);

  let results = (db.results || []).filter(r => r.studentId === tokenRecord.studentId);
  if (tokenRecord.term)    results = results.filter(r => r.term    === tokenRecord.term);
  if (tokenRecord.session) results = results.filter(r => r.session === tokenRecord.session);

  const remarkEntry = (db.remarks || []).find(r =>
    r.studentId === tokenRecord.studentId &&
    (!tokenRecord.term    || r.term    === tokenRecord.term) &&
    (!tokenRecord.session || r.session === tokenRecord.session)
  ) || {};

  const domain = (db.domainAssessments || []).find(d =>
    d.studentId === tokenRecord.studentId &&
    (!tokenRecord.term    || d.term    === tokenRecord.term) &&
    (!tokenRecord.session || d.session === tokenRecord.session)
  ) || {};

  return res.json({
    success: true,
    valid:   true,
    token: {
      code:        tokenRecord.code,
      studentId:   tokenRecord.studentId,
      studentName: tokenRecord.studentName || student?.name,
      term:        tokenRecord.term,
      session:     tokenRecord.session,
      expiresAt:   tokenRecord.expiresAt || tokenRecord.expires,
      useCount:    tokenRecord.useCount  || tokenRecord.used,
      maxUses:     tokenRecord.maxUses,
    },
    student,
    results,
    remarks: {
      teacherRemark:   remarkEntry.teacherRemark   || null,
      principalRemark: remarkEntry.principalRemark || null,
    },
    domain,
    school: db.schoolInfo || {},
  });
}

/* ═══════════════════════════════════════════════════════════════════════════
   GET /api/access-tokens/:code
═══════════════════════════════════════════════════════════════════════════ */
exports.getOne = (req, res) => {
  const code           = normaliseCode(req.params.code);
  const { tokens }     = ensureStore();
  const tokenRecord    = tokens[code];

  if (!tokenRecord) return fail(res, 404, `Token "${code}" not found.`);

  if (!canActOnClass(req.user, tokenRecord.class, tokenRecord.arm))
    return fail(res, 403, 'Access denied.');

  return ok(res, { ...tokenRecord, status: tokenStatus(tokenRecord) });
};

/* ═══════════════════════════════════════════════════════════════════════════
   PATCH /api/access-tokens/:code/revoke
   POST  /api/access-tokens/:code/revoke  (alias)
   Mirrors apiMarkTokenUsed reverse — marks token unusable.
═══════════════════════════════════════════════════════════════════════════ */
exports.revoke = (req, res) => {
  const code           = normaliseCode(req.params.code);
  const { tokens }     = ensureStore();
  const tokenRecord    = tokens[code];

  if (!tokenRecord) return fail(res, 404, `Token "${code}" not found.`);

  if (!canActOnClass(req.user, tokenRecord.class, tokenRecord.arm))
    return fail(res, 403, 'You can only revoke tokens for your assigned class/arm.');

  if (tokenRecord.revoked)
    return fail(res, 409, 'Token is already revoked.');

  const revokedAt = new Date().toISOString();
  const revokedBy = req.user.name || req.user.id || 'System';

  tokenRecord.revoked   = true;
  tokenRecord.revokedAt = revokedAt;
  tokenRecord.revokedBy = revokedBy;
  tokenRecord.auditLog.push({ action: 'revoked', at: revokedAt, by: revokedBy });

  // Mirror in parentTokens array so api-bridge cache stays consistent
  const legacy = (db.parentTokens || []).find(t => normaliseCode(t.token) === code);
  if (legacy) legacy.revoked = true;

  return ok(res, { ...tokenRecord, status: 'revoked' }, { message: `Token "${code}" revoked.` });
};

exports.revokePost = exports.revoke;

/* ═══════════════════════════════════════════════════════════════════════════
   DELETE /api/access-tokens/:code — Admin only
   Hard-delete; prefer revoke for audit trail.
═══════════════════════════════════════════════════════════════════════════ */
exports.remove = (req, res) => {
  const code           = normaliseCode(req.params.code);
  const { tokens, index } = ensureStore();
  const tokenRecord    = tokens[code];

  if (!tokenRecord) return fail(res, 404, `Token "${code}" not found.`);

  if (index[tokenRecord.studentId]) {
    index[tokenRecord.studentId] = index[tokenRecord.studentId].filter(c => c !== code);
  }

  if (db.parentTokens) {
    db.parentTokens = db.parentTokens.filter(t => normaliseCode(t.token) !== code);
  }

  delete tokens[code];
  return ok(res, tokenRecord, { message: `Token "${code}" permanently deleted.` });
};

/* ═══════════════════════════════════════════════════════════════════════════
   GET /api/access-tokens/export/csv
   Query: class*, arm*
   CSV matching downloadTokensCSV() column order.
═══════════════════════════════════════════════════════════════════════════ */
exports.exportCSV = (req, res) => {
  const { class: cls, arm } = req.query;
  if (!cls || !arm) return fail(res, 400, 'class and arm are required.');

  if (!canActOnClass(req.user, cls, arm))
    return fail(res, 403, 'Access denied.');

  const { tokens, index } = ensureStore();
  const students  = (db.students || []).filter(s =>
    s.class === cls && s.arm === arm && s.active !== false
  );
  const portalBase = `${process.env.PORTAL_URL || 'https://sacredheartcollegeaba.com'}/check-result.html?code=`;

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
      latest ? (latest.expiresAt || latest.expires || '').split('T')[0] : '—',
      latest ? `${portalBase}${latest.code}` : '—',
    ]);
  });

  const csv = rows
    .map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\r\n');

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="tokens_${cls}_${arm}_${Date.now()}.csv"`);
  return res.send('\uFEFF' + csv);
};