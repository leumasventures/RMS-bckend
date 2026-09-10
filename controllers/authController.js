'use strict';

/**
 * authController.js — Sacred Heart College Eziukwu Aba (SAHARCO)
 * ──────────────────────────────────────────────────────────────────
 * Handles: login | logout | getMe | changePassword |
 *          forgotPassword | resetPassword | refreshToken
 *
 * KEY CHANGES vs previous version:
 *
 *  1. refreshToken — now also returns { user, token } in the response body
 *     (in addition to setting cookies) so the frontend can save the token
 *     to sessionStorage on a fresh page load when sessionStorage is empty.
 *
 *  2. getMe — now also returns { token } in the response body.
 *     This lets verifySession() save a fresh token if it got one via cookie.
 *
 *  Both changes are needed because sessionStorage is cleared on tab close,
 *  so on the next visit the frontend has no Bearer token.  The refresh cookie
 *  survives (7-day HttpOnly, SameSite=None, Secure) so /auth/refresh is the
 *  recovery path.
 */

const bcrypt = require('bcryptjs');
const jwt    = require('jsonwebtoken');
const crypto = require('crypto');
const db     = require('../config/db');

// ── Environment guards ────────────────────────────────────────────────────────
const JWT_SECRET         = process.env.JWT_ACCESS_SECRET;
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET ?? JWT_SECRET + '_refresh';
const JWT_EXPIRES_IN     = process.env.JWT_ACCESS_EXP     ?? '7d';
const REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXP    ?? '7d';
const IS_PROD            = process.env.NODE_ENV === 'production';
const SALT_ROUNDS        = 10;

if (!JWT_SECRET) throw new Error('JWT_ACCESS_SECRET environment variable is not set.');

// ── In-memory stores ──────────────────────────────────────────────────────────
/** @type {Map<string, { userId: number, expiresAt: number }>} */
const _refreshTokens = new Map();

/** @type {Map<string, { userId: number, expiresAt: number, used: boolean }>} */
const _resetTokens = new Map();

/** @type {Map<string, { count: number, windowStart: number }>} */
const _loginAttempts = new Map();

// ── Constants ─────────────────────────────────────────────────────────────────
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const RATE_LIMIT_MAX       = 5;
const RESET_TOKEN_TTL_MS   = 60 * 60 * 1000;
const BCRYPT_DUMMY_HASH    = bcrypt.hashSync('__dummy__', SALT_ROUNDS);

// ── Cookie helpers ────────────────────────────────────────────────────────────
// Frontend (sacredheartcollegeaba.com) and backend (rms-bckend.onrender.com)
// are different origins. Cookies require SameSite=None + Secure=true to be
// sent cross-origin. The access token is short-lived (15 min) and also
// returned in the response body so the frontend can store it in sessionStorage
// and send it as a Bearer header — avoiding cross-origin cookie restrictions.
const IS_CROSS_ORIGIN = process.env.CROSS_ORIGIN !== 'false'; // default true

const BASE_COOKIE_OPTS = {
  httpOnly: true,
  secure:   IS_PROD || IS_CROSS_ORIGIN,
  sameSite: IS_CROSS_ORIGIN ? 'none' : (IS_PROD ? 'strict' : 'lax'),
  path:     '/',
};

function setAccessCookie(res, token) {
  res.cookie('access_token', token, {
    ...BASE_COOKIE_OPTS,
    maxAge: 15 * 60 * 1000,   // 15 min
  });
}

function setRefreshCookie(res, token) {
  res.cookie('refresh_token', token, {
    ...BASE_COOKIE_OPTS,
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path:   '/api/auth/refresh',   // scoped — sent ONLY to this endpoint
  });
}

function clearAuthCookies(res) {
  res.clearCookie('access_token',  { path: '/' });
  res.clearCookie('refresh_token', { path: '/api/auth/refresh' });
}

// ── Token factories ───────────────────────────────────────────────────────────
function signAccessToken(user) {
  return jwt.sign(
    { id: user.id, role: user.role, name: user.name },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

function signRefreshToken(user) {
  const token = jwt.sign(
    { id: user.id },
    JWT_REFRESH_SECRET,
    { expiresIn: REFRESH_EXPIRES_IN }
  );
  _refreshTokens.set(token, {
    userId:    user.id,
    expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
  });
  return token;
}

// ── Rate limiting ─────────────────────────────────────────────────────────────
function isRateLimited(ip) {
  const entry = _loginAttempts.get(ip);
  const now   = Date.now();
  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    _loginAttempts.set(ip, { count: 1, windowStart: now });
    return false;
  }
  entry.count += 1;
  return entry.count > RATE_LIMIT_MAX;
}

function resetRateLimit(ip) {
  _loginAttempts.delete(ip);
}

// ── Safe user serialiser ──────────────────────────────────────────────────────
function safeUser(user) {
  // eslint-disable-next-line no-unused-vars
  const { passwordHash, password_hash, ...safe } = user;
  // Normalise snake_case DB columns to camelCase for the frontend
  safe.assignedClass = safe.assigned_class ?? safe.assignedClass ?? null;
  safe.assignedArm   = safe.assigned_arm   ?? safe.assignedArm   ?? null;
  return safe;
}

// ── Response helpers ──────────────────────────────────────────────────────────
const fail = (res, status, message, extra = {}) =>
  res.status(status).json({ success: false, message, ...extra });

const ok = (res, data = {}) =>
  res.json({ success: true, ...data });

// ── Controllers ───────────────────────────────────────────────────────────────

/**
 * POST /auth/login
 * Returns: { success, user, token }
 * Also sets access_token + refresh_token cookies.
 */
exports.login = async (req, res) => {
  const ip = req.ip ?? req.socket?.remoteAddress ?? 'unknown';

  if (isRateLimited(ip))
    return fail(res, 429, 'Too many login attempts. Please wait 15 minutes and try again.', {
      retryAfter: RATE_LIMIT_WINDOW_MS / 1000,
    });

  const { email, password, role } = req.body ?? {};

  if (!email || !password)
    return fail(res, 400, 'Email and password are required.');

  const user        = await db.getUserWithPassword(String(email));
  const hashToCheck = user ? (user.password_hash || user.passwordHash || '') : BCRYPT_DUMMY_HASH;
  const passwordOk  = await bcrypt.compare(String(password), hashToCheck);

  if (!user || !passwordOk)
    return fail(res, 401, 'Invalid credentials.');

  if (role && user.role.toLowerCase() !== String(role).toLowerCase())
    return fail(res, 403, 'Access denied for the selected role.');

  if (!user.active)
    return fail(res, 403, 'This account has been deactivated. Please contact the administrator.');

  resetRateLimit(ip);

  const accessToken  = signAccessToken(user);
  const refreshToken = signRefreshToken(user);

  setAccessCookie(res, accessToken);
  setRefreshCookie(res, refreshToken);

  // Return token in body — frontend saves it to sessionStorage as shc_token
  // and sends it as Authorization: Bearer <token> on all subsequent requests.
  return ok(res, { user: safeUser(user), token: accessToken });
};

/**
 * POST /auth/logout
 */
exports.logout = (req, res) => {
  const refreshToken = req.cookies?.refresh_token;
  if (refreshToken) _refreshTokens.delete(refreshToken);
  clearAuthCookies(res);
  return ok(res, { message: 'Logged out successfully.' });
};

/**
 * GET /auth/me
 * Returns: { success, user, token }
 *
 * FIX: also returns a fresh access token in the body so that if the frontend
 * somehow has a valid cookie but no sessionStorage token (e.g. after a hard
 * refresh), it can recover the token without needing to log in again.
 */
exports.getMe = (req, res) => {
  // Issue a fresh short-lived access token on every /auth/me call.
  // Cost: negligible (just a jwt.sign). Benefit: seamless token recovery.
  const freshToken = signAccessToken(req.user);
  setAccessCookie(res, freshToken);   // rotate the cookie too
  return ok(res, { user: safeUser(req.user), token: freshToken });
};

/**
 * POST /auth/refresh
 * Returns: { success, user, token }
 *
 * FIX: now returns full { user, token } in the body (previously only set
 * cookies). The frontend calls this endpoint when sessionStorage is empty
 * to recover a usable Bearer token using the long-lived refresh cookie.
 * The refresh cookie IS sent cross-origin because it has SameSite=None;
 * Secure and is scoped to path=/api/auth/refresh.
 */
exports.refreshToken = async (req, res) => {
  const token = req.cookies?.refresh_token;

  if (!token)
    return fail(res, 401, 'No refresh token provided.');

  // Validate by JWT signature only — do NOT require the in-memory store.
  // The in-memory store (_refreshTokens Map) is wiped on every server restart
  // (Render restarts on every deploy and periodically), which would invalidate
  // all sessions. JWT signature validation is stateless and restart-safe.
  let payload;
  try {
    payload = jwt.verify(token, JWT_REFRESH_SECRET);
  } catch (err) {
    clearAuthCookies(res);
    const msg = err.name === 'TokenExpiredError'
      ? 'Your session has expired. Please log in again.'
      : 'Refresh token is invalid. Please log in again.';
    return fail(res, 401, msg);
  }

  // Load full user
  const user = await (db.getUserById
    ? db.getUserById(payload.id)
    : Promise.resolve(db.findUserById && db.findUserById(payload.id)));

  if (!user || !user.active) {
    clearAuthCookies(res);
    return fail(res, 401, 'Account not found or deactivated.');
  }

  // Issue a new access token and rotate the refresh token
  const newAccess  = signAccessToken(user);
  const newRefresh = signRefreshToken(user);

  setAccessCookie(res, newAccess);
  setRefreshCookie(res, newRefresh);

  // Return token in body so frontend saves it to sessionStorage as shc_token
  return ok(res, { user: safeUser(user), token: newAccess });
};

/**
 * POST /auth/change-password
 */
exports.changePassword = async (req, res) => {
  const { currentPassword, newPassword } = req.body ?? {};

  if (!currentPassword || !newPassword)
    return fail(res, 400, 'currentPassword and newPassword are required.');
  if (newPassword.length < 8)
    return fail(res, 400, 'New password must be at least 8 characters.');
  if (currentPassword === newPassword)
    return fail(res, 400, 'New password must be different from the current password.');

  const user = await db.getUserById(req.user.id);
  if (!user) return fail(res, 404, 'User not found.');

  const fullUser   = await db.getUserWithPassword(user.email);
  const storedHash = fullUser ? (fullUser.password_hash || fullUser.passwordHash || '') : '';
  const match      = await bcrypt.compare(String(currentPassword), storedHash);
  if (!match) return fail(res, 401, 'Current password is incorrect.');

  const newHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
  await db.run('UPDATE users SET password_hash = ? WHERE id = ?', [newHash, user.id]);

  for (const [token, data] of _refreshTokens) {
    if (data.userId === user.id) _refreshTokens.delete(token);
  }

  clearAuthCookies(res);
  return ok(res, { message: 'Password updated. Please log in again with your new password.' });
};

/**
 * POST /auth/forgot-password
 */
exports.forgotPassword = async (req, res) => {
  const GENERIC_MSG = 'If that email address is registered, a reset link has been sent.';
  const { email } = req.body ?? {};
  if (!email) return fail(res, 400, 'Email is required.');

  const user = db.findUserByEmail(String(email));
  if (user && user.active) {
    const rawToken  = crypto.randomBytes(32).toString('hex');
    const expiresAt = Date.now() + RESET_TOKEN_TTL_MS;
    _resetTokens.set(rawToken, { userId: user.id, expiresAt, used: false });
    const resetLink = `${process.env.FRONTEND_URL ?? 'https://sacredheartcollegeaba.com'}/reset-password?token=${rawToken}`;
    console.info(`[AUTH] Password reset link for ${user.email}: ${resetLink}`);
  }

  return ok(res, { message: GENERIC_MSG });
};

/**
 * POST /auth/reset-password
 */
exports.resetPassword = async (req, res) => {
  const { token, newPassword } = req.body ?? {};

  if (!token || !newPassword)
    return fail(res, 400, 'token and newPassword are required.');
  if (newPassword.length < 8)
    return fail(res, 400, 'Password must be at least 8 characters.');

  const record = _resetTokens.get(String(token));
  if (!record || record.used || record.expiresAt < Date.now())
    return fail(res, 400, 'This reset link is invalid or has expired. Please request a new one.');

  const user = await db.getUserById(record.userId);
  if (!user || !user.active)
    return fail(res, 404, 'Account not found or deactivated.');

  const newHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
  await db.run('UPDATE users SET password_hash = ? WHERE id = ?', [newHash, user.id]);

  record.used = true;

  for (const [t, data] of _refreshTokens) {
    if (data.userId === user.id) _refreshTokens.delete(t);
  }

  return ok(res, { message: 'Password reset successfully. You can now log in.' });
};
/* ── POST /api/auth/signup-request — public, no auth ────────────────────── */
exports.signupRequest = async (req, res) => {
  try {
    const { type, data } = req.body ?? {};
    if (!type || !data) return fail(res, 400, 'type and data are required.');

    // Build full name — frontend sends firstname/lastname separately
    const name = data.name ||
      [data.firstname, data.lastname].filter(Boolean).map(s => String(s).trim()).join(' ') ||
      data.fullname || '';
    const email = (data.email || '').toLowerCase().trim();

    if (!name) return fail(res, 400, 'name is required.');
    if (!email) return fail(res, 400, 'email is required.');

    // Reject duplicate pending request for same email
    const existing = await db.query1(
      `SELECT id FROM signup_requests WHERE email=? AND status='pending'`,
      [email]
    );
    if (existing) return fail(res, 409, 'A pending request for this email already exists. Please wait for admin approval.');

    const result = await db.run(
      `INSERT INTO signup_requests (type, name, email, phone, role_detail, student_id, raw_data, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`,
      [
        type,
        name,
        email,
        data.phone || null,
        data.position || data.subject || data.department || data.relation || data.relationship || null,
        data.studentId || data.ward_id || null,
        JSON.stringify({ ...data, name }),  // ensure name is in raw_data too
      ]
    );

    return res.status(201).json({
      success: true,
      message: 'Request submitted. The school admin will review and activate your account.',
      data: { id: result.insertId },
    });
  } catch (e) { return fail(res, 500, e.message); }
};

/* ── GET /api/auth/signup-requests — Admin only ─────────────────────────── */
exports.getSignupRequests = async (req, res) => {
  try {
    const { status } = req.query;
    let sql = 'SELECT * FROM signup_requests WHERE 1=1';
    const p = [];
    if (status) { sql += ' AND status=?'; p.push(status); }
    sql += ' ORDER BY created_at DESC';
    const rows = await db.query(sql, p);
    const pending = rows.filter(r => r.status === 'pending').length;
    return res.json({ success: true, data: rows, pending });
  } catch (e) { return fail(res, 500, e.message); }
};

/* ── PATCH /api/auth/signup-requests/:id — Admin: approve or reject ──────── */
exports.reviewSignupRequest = async (req, res) => {
  try {
    const { action, note, password } = req.body ?? {};
    if (!['approve','reject'].includes(action)) return fail(res, 400, 'action must be approve or reject.');

    const row = await db.query1('SELECT * FROM signup_requests WHERE id=?', [req.params.id]);
    if (!row) return fail(res, 404, 'Signup request not found.');
    if (row.status !== 'pending') return fail(res, 400, `Request is already ${row.status}.`);

    if (action === 'reject') {
      await db.run(
        `UPDATE signup_requests SET status='rejected', reviewed_by=?, review_note=?, updated_at=NOW() WHERE id=?`,
        [req.user?.name || null, note || null, req.params.id]
      );
      return res.json({ success: true, message: 'Request rejected.', data: { id: row.id, status: 'rejected' } });
    }

    // Approve → create user account
    const roleMap = { staff: 'Teacher', parent: 'Parent', student: 'Student' };
    const role    = roleMap[row.type] || 'Parent';
    const rawData = row.raw_data ? (typeof row.raw_data === 'string' ? JSON.parse(row.raw_data) : row.raw_data) : {};

    // Check email not already a user
    const existingUser = await db.query1('SELECT id FROM users WHERE email=?', [row.email]);
    if (existingUser) {
      await db.run(`UPDATE signup_requests SET status='approved', reviewed_by=? WHERE id=?`, [req.user?.name, req.params.id]);
      return res.json({ success: true, message: 'User already exists — request marked approved.', data: { id: row.id, status: 'approved' } });
    }

    const bcrypt  = require('bcryptjs');
    const tempPwd = password || ('SHC@' + Math.random().toString(36).slice(-6).toUpperCase());
    const hash    = await bcrypt.hash(tempPwd, 10);

    const userResult = await db.run(
      `INSERT INTO users (name, email, role, password_hash, active) VALUES (?, ?, ?, ?, 1)`,
      [row.name, row.email, role, hash]
    );

    await db.run(
      `UPDATE signup_requests SET status='approved', reviewed_by=?, review_note=?, updated_at=NOW() WHERE id=?`,
      [req.user?.name || null, note || null, req.params.id]
    );

    return res.status(201).json({
      success: true,
      message: `Account created for ${row.name}. Temporary password: ${tempPwd}`,
      data: { id: row.id, userId: userResult.insertId, status: 'approved', tempPassword: tempPwd },
    });
  } catch (e) { return fail(res, 500, e.message); }
};
/* ═══════════════════════════════════════════════════════════════════
   POST /api/auth/parent-register  — PUBLIC (no token required)
   Parent self-registration: verifies student ID + phone, then creates
   a Parent user account with ward_id linked to the student.
   Body: { studentId, phone, name, email, password, relationship }
═══════════════════════════════════════════════════════════════════ */
exports.parentRegister = async (req, res) => {
  try {
    const { studentId, phone, name, email, password, relationship } = req.body ?? {};

    // ── Validate inputs ───────────────────────────────────────────
    if (!studentId) return fail(res, 400, 'studentId is required.');
    if (!phone)     return fail(res, 400, 'phone is required.');
    if (!name)      return fail(res, 400, 'name is required.');
    if (!email)     return fail(res, 400, 'email is required.');
    if (!password)  return fail(res, 400, 'password is required.');
    if (password.length < 6) return fail(res, 400, 'Password must be at least 6 characters.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      return fail(res, 400, 'Invalid email address.');

    // ── Verify student exists ─────────────────────────────────────
    const student = await db.query1(
      'SELECT * FROM students WHERE id = ?',
      [decodeURIComponent(studentId)]
    );
    if (!student) return fail(res, 404, 'Student not found. Please check the Admission Number.');

    // ── Verify phone matches ───────────────────────────────────────
    const stored  = (student.phone || student.parent_phone || '')
      .replace(/\s/g, '').replace(/^(\+234|234)/, '0');
    const entered = String(phone).replace(/\s/g, '').replace(/^(\+234|234)/, '0');

    if (!stored || entered.slice(-8) !== stored.slice(-8))
      return fail(res, 403, 'Phone number does not match our records. Please contact the school admin office.');

    // ── Check email not already in use ────────────────────────────
    const existing = await db.query1(
      'SELECT id FROM users WHERE email = ?',
      [email.toLowerCase().trim()]
    );
    if (existing) return fail(res, 409, 'This email address is already registered. Try logging in, or use a different email.');

    // ── Check student doesn't already have a linked parent account ─
    const existingParent = await db.query1(
      "SELECT id, email FROM users WHERE ward_id = ? AND role = 'Parent'",
      [student.id]
    );
    if (existingParent)
      return fail(res, 409,
        `A parent account already exists for this student (${existingParent.email}). ` +
        'If you have forgotten your password, use "Forgot Password" on the login page, or contact the admin.'
      );

    // ── Create the user account ───────────────────────────────────
    // Ensure note column exists
    await db.run("ALTER TABLE users ADD COLUMN IF NOT EXISTS note TEXT DEFAULT NULL").catch(() => {});

    const hash = await bcrypt.hash(password, 10);
    const result = await db.run(
      `INSERT INTO users (name, email, role, password_hash, ward_id, note, active)
       VALUES (?, ?, 'Parent', ?, ?, ?, 1)`,
      [
        String(name).trim(),
        email.toLowerCase().trim(),
        hash,
        student.id,
        relationship ? `${relationship} of ${student.name}` : `Parent of ${student.name}`,
      ]
    );

    // ── Update student parent_email if not already set ────────────
    if (!student.parent_email && email) {
      await db.run(
        'ALTER TABLE students ADD COLUMN IF NOT EXISTS parent_email VARCHAR(160) DEFAULT NULL'
      ).catch(() => {});
      await db.run(
        'UPDATE students SET parent_email = ? WHERE id = ? AND (parent_email IS NULL OR parent_email = "")',
        [email.toLowerCase().trim(), student.id]
      ).catch(() => {});
    }

    // ── Sync in-memory cache ──────────────────────────────────────
    const saved = await db.query1(
      `SELECT id, name, email, role, ward_id, active, created_at FROM users WHERE id = ?`,
      [result.insertId]
    );
    if (db.users) db.users.push({ ...saved, active: true });

    return res.status(201).json({
      success: true,
      message: `Account created successfully for ${name}. You can now log in.`,
      data: {
        id:       saved.id,
        name:     saved.name,
        email:    saved.email,
        role:     'Parent',
        ward_id:  student.id,
        student:  { id: student.id, name: student.name, class: student.class_name || student.class || '', arm: student.arm || '' },
      },
    });

  } catch (e) {
    console.error('[parentRegister]', e.message);
    return fail(res, 500, e.message);
  }
};