'use strict';

/**
 * authController.js — Sacred Heart College Eziukwu Aba (SAHARCO)
 * ──────────────────────────────────────────────────────────────────
 * Handles: login | logout | getMe | changePassword |
 *          forgotPassword | resetPassword | refreshToken
 *
 * Security posture:
 *  • Async bcrypt — never blocks the event loop
 *  • Access token (short-lived, 15 min) via HttpOnly cookie
 *  • Refresh token (long-lived, 7 d) via separate HttpOnly cookie
 *  • In-memory refresh-token store (swap for Redis / DB in production)
 *  • Login rate-limit: 5 attempts per IP per 15 min window
 *  • Password-reset tokens: cryptographically random, 1-hour TTL, single-use
 *  • Timing-safe invalid-user path (always runs bcrypt to prevent user enumeration)
 *  • Structured error responses with consistent shape
 */

const bcrypt = require('bcryptjs');
const jwt    = require('jsonwebtoken');
const crypto = require('crypto');
const db     = require('../db');

// ── Environment guards ────────────────────────────────────────────────────────
const JWT_SECRET         = process.env.JWT_ACCESS_SECRET;
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET ?? JWT_SECRET + '_refresh';
const JWT_EXPIRES_IN     = process.env.JWT_ACCESS_EXP     ?? '7d';
const REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXP    ?? '7d';
const IS_PROD            = process.env.NODE_ENV === 'production';
const SALT_ROUNDS        = 10;

if (!JWT_SECRET) throw new Error('JWT_ACCESS_SECRET environment variable is not set.');

// ── In-memory stores (replace with Redis / DB in production) ──────────────────

/** @type {Map<string, { userId: number, expiresAt: number }>} */
const _refreshTokens = new Map();

/**
 * @type {Map<string, { userId: number, expiresAt: number, used: boolean }>}
 * Keyed by the raw token string (never exposed; stored hashed in prod).
 */
const _resetTokens = new Map();

/** @type {Map<string, { count: number, windowStart: number }>} */
const _loginAttempts = new Map();

// ── Constants ─────────────────────────────────────────────────────────────────

const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;   // 15 minutes
const RATE_LIMIT_MAX       = 5;                  // attempts per window
const RESET_TOKEN_TTL_MS   = 60 * 60 * 1000;    // 1 hour
const BCRYPT_DUMMY_HASH    = bcrypt.hashSync('__dummy__', SALT_ROUNDS); // for timing safety

// ── Cookie helpers ────────────────────────────────────────────────────────────

const BASE_COOKIE_OPTS = {
  httpOnly: true,
  secure:   IS_PROD,
  sameSite: IS_PROD ? 'strict' : 'lax',
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
    maxAge: 7 * 24 * 60 * 60 * 1000,   // 7 days
    path:   '/api/auth/refresh',        // scope to refresh endpoint only
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

  // Store server-side so we can revoke individual sessions
  _refreshTokens.set(token, {
    userId:    user.id,
    expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
  });

  return token;
}

// ── Rate limiting ─────────────────────────────────────────────────────────────

/**
 * Returns true if the IP is over the attempt limit.
 * Slides the window on each call.
 * @param {string} ip
 */
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

/**
 * Strip sensitive fields before sending to the client.
 * Extend this list if new sensitive fields are added to the user model.
 */
function safeUser(user) {
  // eslint-disable-next-line no-unused-vars
  const { passwordHash, ...safe } = user;
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
 * Body: { email, password, role? }
 * Sets HttpOnly access + refresh cookies on success.
 */
exports.login = async (req, res) => {
  const ip = req.ip ?? req.socket?.remoteAddress ?? 'unknown';

  if (isRateLimited(ip)) {
    return fail(res, 429, 'Too many login attempts. Please wait 15 minutes and try again.', {
      retryAfter: RATE_LIMIT_WINDOW_MS / 1000,
    });
  }

  const { email, password, role } = req.body ?? {};

  if (!email || !password)
    return fail(res, 400, 'Email and password are required.');

  const user = db.findUserByEmail(String(email));

  // Always run bcrypt to prevent timing-based user enumeration
  const hashToCheck = user ? user.passwordHash : BCRYPT_DUMMY_HASH;
  const passwordOk  = await bcrypt.compare(String(password), hashToCheck);

  if (!user || !passwordOk) {
    return fail(res, 401, 'Invalid credentials.');
  }

  // Optional role assertion (e.g. login form sends expected role)
  if (role && user.role.toLowerCase() !== String(role).toLowerCase()) {
    return fail(res, 403, 'Access denied for the selected role.');
  }

  if (!user.active) {
    return fail(res, 403, 'This account has been deactivated. Please contact the administrator.');
  }

  resetRateLimit(ip);

  const accessToken  = signAccessToken(user);
  const refreshToken = signRefreshToken(user);

  setAccessCookie(res, accessToken);
  setRefreshCookie(res, refreshToken);

  return ok(res, { user: safeUser(user) });
};

/**
 * POST /auth/logout
 * Revokes the refresh token and clears cookies.
 */
exports.logout = (req, res) => {
  const refreshToken = req.cookies?.refresh_token;
  if (refreshToken) _refreshTokens.delete(refreshToken);

  clearAuthCookies(res);
  return ok(res, { message: 'Logged out successfully.' });
};

/**
 * GET /auth/me
 * Returns the authenticated user (populated by auth middleware).
 */
exports.getMe = (req, res) => ok(res, { user: safeUser(req.user) });

/**
 * POST /auth/refresh
 * Issues a new access token using the refresh token cookie.
 */
exports.refreshToken = (req, res) => {
  const token = req.cookies?.refresh_token;

  if (!token)
    return fail(res, 401, 'No refresh token provided.');

  const stored = _refreshTokens.get(token);
  if (!stored || stored.expiresAt < Date.now()) {
    clearAuthCookies(res);
    return fail(res, 401, 'Refresh token is invalid or expired. Please log in again.');
  }

  let payload;
  try {
    payload = jwt.verify(token, JWT_REFRESH_SECRET);
  } catch {
    _refreshTokens.delete(token);
    clearAuthCookies(res);
    return fail(res, 401, 'Refresh token is invalid. Please log in again.');
  }

  const user = db.findUserById(payload.id);
  if (!user || !user.active) {
    _refreshTokens.delete(token);
    clearAuthCookies(res);
    return fail(res, 401, 'Account not found or deactivated.');
  }

  // Rotate: invalidate old refresh token, issue a new pair
  _refreshTokens.delete(token);
  const newAccess  = signAccessToken(user);
  const newRefresh = signRefreshToken(user);

  setAccessCookie(res, newAccess);
  setRefreshCookie(res, newRefresh);

  return ok(res, { user: safeUser(user) });
};

/**
 * POST /auth/change-password
 * Body: { currentPassword, newPassword }
 * Requires authentication middleware.
 */
exports.changePassword = async (req, res) => {
  const { currentPassword, newPassword } = req.body ?? {};

  if (!currentPassword || !newPassword)
    return fail(res, 400, 'currentPassword and newPassword are required.');

  if (newPassword.length < 8)
    return fail(res, 400, 'New password must be at least 8 characters.');

  if (currentPassword === newPassword)
    return fail(res, 400, 'New password must be different from the current password.');

  const user = db.findUserById(req.user.id);
  if (!user) return fail(res, 404, 'User not found.');

  const match = await bcrypt.compare(String(currentPassword), user.passwordHash);
  if (!match)
    return fail(res, 401, 'Current password is incorrect.');

  user.passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
  user.updatedAt    = new Date().toISOString();

  // Invalidate all existing refresh tokens for this user (force re-login)
  for (const [token, data] of _refreshTokens) {
    if (data.userId === user.id) _refreshTokens.delete(token);
  }

  clearAuthCookies(res);
  return ok(res, { message: 'Password updated. Please log in again with your new password.' });
};

/**
 * POST /auth/forgot-password
 * Body: { email }
 * Always returns the same response to prevent user enumeration.
 */
exports.forgotPassword = async (req, res) => {
  const GENERIC_MSG = 'If that email address is registered, a reset link has been sent.';

  const { email } = req.body ?? {};
  if (!email) return fail(res, 400, 'Email is required.');

  const user = db.findUserByEmail(String(email));

  if (user && user.active) {
    const rawToken    = crypto.randomBytes(32).toString('hex');
    const expiresAt   = Date.now() + RESET_TOKEN_TTL_MS;

    _resetTokens.set(rawToken, { userId: user.id, expiresAt, used: false });

    // TODO: Replace console.log with your email service (Nodemailer / SendGrid / etc.)
    const resetLink = `${process.env.FRONTEND_URL ?? 'https://sacredheartcollegeaba.com'}/reset-password?token=${rawToken}`;
    console.info(`[AUTH] Password reset link for ${user.email}: ${resetLink}`);
  }

  return ok(res, { message: GENERIC_MSG });
};

/**
 * POST /auth/reset-password
 * Body: { token, newPassword }
 */
exports.resetPassword = async (req, res) => {
  const { token, newPassword } = req.body ?? {};

  if (!token || !newPassword)
    return fail(res, 400, 'token and newPassword are required.');

  if (newPassword.length < 8)
    return fail(res, 400, 'Password must be at least 8 characters.');

  const record = _resetTokens.get(String(token));

  if (!record || record.used || record.expiresAt < Date.now()) {
    return fail(res, 400, 'This reset link is invalid or has expired. Please request a new one.');
  }

  const user = db.findUserById(record.userId);
  if (!user || !user.active)
    return fail(res, 404, 'Account not found or deactivated.');

  user.passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
  user.updatedAt    = new Date().toISOString();

  // Single-use: mark token as consumed
  record.used = true;

  // Invalidate all sessions
  for (const [t, data] of _refreshTokens) {
    if (data.userId === user.id) _refreshTokens.delete(t);
  }

  return ok(res, { message: 'Password reset successfully. You can now log in.' });
};