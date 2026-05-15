'use strict';

/**
 * middleware/auth.js — Sacred Heart College Eziukwu Aba (SAHARCO)
 * ─────────────────────────────────────────────────────────────────
 * Authenticates requests by reading a JWT from:
 *   1. Authorization: Bearer <token>  header  (preferred — works cross-origin)
 *   2. access_token HttpOnly cookie           (fallback — same-origin only)
 *
 * The frontend stores the token in sessionStorage after login and sends it
 * as a Bearer header on every request via api.js.  The cookie path is kept
 * as a fallback for same-origin deployments or future SSR pages.
 */

const jwt = require('jsonwebtoken');
const db  = require('../config/db');

const JWT_SECRET = process.env.JWT_ACCESS_SECRET;

if (!JWT_SECRET) throw new Error('JWT_ACCESS_SECRET environment variable is not set.');

/**
 * authenticate(req, res, next)
 * Reads the JWT from the Authorization header (Bearer) or cookie.
 * Attaches the full user record to req.user on success.
 * Returns 401 on missing/invalid/expired token.
 */
exports.authenticate = async (req, res, next) => {
  try {
    // ── 1. Extract token ────────────────────────────────────────────────────
    let token = null;

    // Authorization: Bearer <token>  (sent by api.js on every request)
    const authHeader = req.headers['authorization'] || req.headers['Authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.slice(7).trim();
    }

    // Fallback: HttpOnly cookie (same-origin or browser-native requests)
    if (!token && req.cookies && req.cookies.access_token) {
      token = req.cookies.access_token;
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required. Please log in.',
      });
    }

    // ── 2. Verify token ─────────────────────────────────────────────────────
    let payload;
    try {
      payload = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      const message = err.name === 'TokenExpiredError'
        ? 'Session has expired. Please log in again.'
        : 'Invalid token. Please log in again.';
      return res.status(401).json({ success: false, message });
    }

    // ── 3. Load user from DB ────────────────────────────────────────────────
    // Use getUserById if available; fall back to findUserById for in-memory stores
    const user = await (db.getUserById
      ? db.getUserById(payload.id)
      : Promise.resolve(db.findUserById && db.findUserById(payload.id)));

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Account not found. Please log in again.',
      });
    }

    if (user.active === false) {
      return res.status(403).json({
        success: false,
        message: 'This account has been deactivated. Please contact the administrator.',
      });
    }

    // ── 4. Attach to request ────────────────────────────────────────────────
    req.user = user;
    next();

  } catch (err) {
    console.error('[auth middleware] Unexpected error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error.' });
  }
};

/**
 * authorize(...roles)
 * Role-based access control — use after authenticate.
 *
 * Usage:
 *   router.delete('/classes/:id', authenticate, authorize('Admin'), handler)
 *
 * @param {...string} roles  Allowed roles (case-insensitive)
 */
exports.authorize = function (...roles) {
  const allowed = roles.map(r => r.toLowerCase());
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Not authenticated.' });
    }
    if (!allowed.includes((req.user.role || '').toLowerCase())) {
      return res.status(403).json({
        success: false,
        message: `Access denied. Required role: ${roles.join(' or ')}.`,
      });
    }
    next();
  };
};