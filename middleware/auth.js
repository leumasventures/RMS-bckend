'use strict';

/**
 * middleware/auth.js — Sacred Heart College Eziukwu Aba (SAHARCO)
 * ──────────────────────────────────────────────────────────────────
 * authenticate  — verifies the HttpOnly access-token cookie,
 *                 attaches req.user, calls next() or returns 401.
 *
 * authorize     — role guard factory; call after authenticate.
 *                 authorize('Admin', 'Teacher') → middleware that
 *                 returns 403 if req.user.role is not in the list.
 */

const jwt = require('jsonwebtoken');
const db  = require('../config/db');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error('JWT_SECRET environment variable is not set.');

// ── authenticate ──────────────────────────────────────────────────────────────

/**
 * Reads the access_token HttpOnly cookie, verifies it, and hydrates
 * req.user from the database (so the controller always has a fresh
 * user object, not a stale JWT snapshot).
 *
 * Falls back to a Bearer token in the Authorization header so that
 * API clients / Postman can authenticate during development without
 * needing to manage cookies.
 */
exports.authenticate = (req, res, next) => {
  const tokenFromCookie = req.cookies?.access_token;
  const tokenFromHeader = req.headers.authorization?.startsWith('Bearer ')
    ? req.headers.authorization.slice(7)
    : null;

  const token = tokenFromCookie ?? tokenFromHeader;

  if (!token) {
    return res.status(401).json({ success: false, message: 'Authentication required.' });
  }

  let payload;
  try {
    payload = jwt.verify(token, JWT_SECRET);
  } catch (err) {
    const message = err.name === 'TokenExpiredError'
      ? 'Session expired. Please log in again.'
      : 'Invalid token. Please log in again.';
    return res.status(401).json({ success: false, message });
  }

  // Hydrate from DB — catches deactivated accounts that still hold a valid token
  const user = db.findUserById(payload.id);
  if (!user || !user.active) {
    return res.status(401).json({ success: false, message: 'Account not found or deactivated.' });
  }

  req.user = user;
  next();
};

// ── authorize ─────────────────────────────────────────────────────────────────

/**
 * Role-guard factory. Usage:
 *   router.use(authorize('Admin'))
 *   router.get('/report', authorize('Admin', 'Teacher'), ctrl.getReport)
 *
 * Must be used after authenticate (depends on req.user).
 *
 * @param {...string} roles  Allowed role names (case-sensitive, match db.users)
 * @returns {import('express').RequestHandler}
 */
exports.authorize = (...roles) => (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ success: false, message: 'Authentication required.' });
  }  
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({
      success: false,
      message: `Access denied. Required role: ${roles.join(' or ')}.`,
    });
  }

  
  next();
};

// Alias so routes.js gets exactly what it asks for
exports.authMiddleware  = exports.authenticate;
exports.requireRole     = exports.authorize;

// ── childAccessGuard ──────────────────────────────────────────────────────────
// Ensures a parent can only access their own child's data.
// Admins and Teachers bypass this check.
exports.childAccessGuard = (req, res, next) => {
  const { studentId } = req.params;
  const { role, linkedChildren } = req.user;

  if (role === 'Admin' || role === 'Teacher') return next();

  const allowed = Array.isArray(linkedChildren) && linkedChildren.includes(studentId);
  if (!allowed) {
    return res.status(403).json({
      success: false,
      message: 'Access denied. You are not linked to this student.',
    });
  }

  next();
};

// ── rateLimiter ───────────────────────────────────────────────────────────────
// Simple in-memory rate limiter — swap for express-rate-limit in production.
const requestLog = new Map(); // ip → { count, windowStart }
const WINDOW_MS  = 60_000;   // 1 minute
const MAX_REQ    = 120;       // requests per window per IP

exports.rateLimiter = (req, res, next) => {
  const ip  = req.ip || req.connection.remoteAddress;
  const now = Date.now();
  const rec = requestLog.get(ip);

  if (!rec || now - rec.windowStart > WINDOW_MS) {
    requestLog.set(ip, { count: 1, windowStart: now });
    return next();
  }

  rec.count++;
  if (rec.count > MAX_REQ) {
    return res.status(429).json({
      success: false,
      message: 'Too many requests. Please slow down.',
    });
  }

  next();
};