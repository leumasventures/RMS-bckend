'use strict';
/**
 * middleware/parentAuth.js — Sacred Heart College
 * ─────────────────────────────────────────────────
 * Accepts EITHER:
 *   a) Parent JWT  — issued by POST /api/students/parent-login
 *                    payload: { type:'parent', studentId, name }
 *   b) Staff JWT   — the normal authenticate JWT
 *                    payload: { id, role, ... }
 *
 * Sets on req:
 *   req.isParent        true | false
 *   req.parentStudentId the ward's student ID  (parent only)
 *   req.user            full user object        (staff only)
 */

const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_PARENT_SECRET || process.env.JWT_ACCESS_SECRET;
if (!SECRET) throw new Error('JWT_ACCESS_SECRET env var is not set.');

const ALLOWED = [
  'https://sacredheartcollegeaba.com',
  'https://www.sacredheartcollegeaba.com',
  'http://localhost:3000','http://localhost:5000',
  'http://localhost:5002','http://127.0.0.1:5500',
];

function setCors(req, res) {
  const o = req.headers.origin;
  if (o && ALLOWED.includes(o)) {
    res.setHeader('Access-Control-Allow-Origin', o);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  }
}

/**
 * parentAuth(req, res, next)
 * Authenticates parent OR staff token.
 */
exports.parentAuth = (req, res, next) => {
  let token = null;
  const h = req.headers['authorization'] || req.headers['Authorization'];
  if (h && h.startsWith('Bearer ')) token = h.slice(7).trim();
  if (!token && req.cookies?.access_token) token = req.cookies.access_token;

  if (!token) {
    setCors(req, res);
    return res.status(401).json({ success: false, message: 'Authentication required.' });
  }

  try {
    const payload = jwt.verify(token, SECRET);

    if (payload.type === 'parent') {
      req.isParent        = true;
      req.parentStudentId = payload.studentId;
    } else {
      req.isParent = false;
      req.user     = payload;
    }
    return next();
  } catch (err) {
    setCors(req, res);
    return res.status(401).json({
      success: false,
      message: err.name === 'TokenExpiredError'
        ? 'Session expired. Please log in again.'
        : 'Invalid token. Please log in again.',
    });
  }
};

/**
 * requireOwnStudent(req, res, next)
 * Must be used AFTER parentAuth.
 * Parents can only access their own ward's data.
 * Staff bypass this check entirely.
 *
 * Reads student ID from (first match):
 *   req.params.studentId | req.params.id | req.query.sid
 */
exports.requireOwnStudent = (req, res, next) => {
  if (!req.isParent) return next(); // staff — unrestricted

  const requested = (
    req.params.studentId ||
    req.params.id        ||
    req.query.sid        ||
    ''
  ).trim();

  if (!requested) {
    return res.status(400).json({ success: false, message: 'Student ID is required.' });
  }
  if (requested !== req.parentStudentId) {
    setCors(req, res);
    return res.status(403).json({
      success: false,
      message: "Access denied — you may only view your ward's records.",
    });
  }
  next();
};