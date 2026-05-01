/* ============================================================
   Sacred Heart College Eziukwu Aba – School Portal
   middleware/auth.js  |  Authentication & Authorisation
   ============================================================ */

'use strict';

const rateLimit = require('express-rate-limit');

/* ─────────────────────────────────────────────────────────────
   authMiddleware
   ─────────────────────────────────────────────────────────────
   Validates the request has an active SHC session.

   Priority order for session lookup:
     1. req.session.shc_session  — server-side express-session (preferred)
     2. x-shc-session header     — base64-encoded JSON (for SPA / fetch calls
                                   where the cookie can't be sent cross-origin)

   On success: attaches req.shcSession and calls next().
   On failure: returns 401 JSON.
───────────────────────────────────────────────────────────── */
function authMiddleware(req, res, next) {
  /* ── 1. Server-side session (express-session cookie) ── */
  if (req.session && req.session.shc_session) {
    req.shcSession = req.session.shc_session;
    return next();
  }

  /* ── 2. Header-based session (fetch / AJAX from SPA) ── */
  const headerRaw = req.headers['x-shc-session'];
  if (headerRaw) {
    try {
      const decoded = JSON.parse(
        Buffer.from(headerRaw, 'base64').toString('utf8')
      );

      /* Basic structural check */
      if (!decoded || !decoded.role || !decoded.name) {
        return _unauthorized(res, 'Malformed session token.');
      }

      /* Reject expired sessions (loggedInAt older than 8 hours) */
      const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
      if (decoded.loggedInAt && Date.now() - decoded.loggedInAt > SESSION_TTL_MS) {
        return _unauthorized(res, 'Session expired. Please log in again.');
      }

      req.shcSession = decoded;
      return next();

    } catch (err) {
      return _unauthorized(res, 'Invalid session token.');
    }
  }

  /* ── 3. No session found ── */
  return _unauthorized(res, 'Not authenticated. Please log in.');
}

/* ─────────────────────────────────────────────────────────────
   requireRole(...roles)
   ─────────────────────────────────────────────────────────────
   Factory that returns middleware enforcing one or more roles.

   Usage:
     router.use(requireRole('Parent'))
     router.get('/admin-only', requireRole('Admin'), handler)
     router.get('/staff',      requireRole('Admin','Teacher'), handler)
───────────────────────────────────────────────────────────── */
function requireRole(...roles) {
  return (req, res, next) => {
    const session = req.shcSession;

    if (!session) {
      return _unauthorized(res, 'Not authenticated.');
    }

    if (!roles.includes(session.role)) {
      return res.status(403).json({
        success:    false,
        error:      `Access denied. Required role: ${roles.join(' or ')}. Your role: ${session.role}.`,
        statusCode: 403,
      });
    }

    next();
  };
}

/* ─────────────────────────────────────────────────────────────
   childAccessGuard(req, res, next)
   ─────────────────────────────────────────────────────────────
   Route-level middleware that checks a Parent may only access
   data for their own children.

   Reads :studentId from req.params.
   Admins and Teachers bypass this check automatically.

   Usage:
     router.get('/subjects/:studentId', childAccessGuard, ctrl.getSubjectScores)
───────────────────────────────────────────────────────────── */
function childAccessGuard(req, res, next) {
  const session   = req.shcSession;
  const studentId = req.params.studentId;

  if (!session) return _unauthorized(res, 'Not authenticated.');

  /* Admin / Teacher — unrestricted */
  if (session.role === 'Admin' || session.role === 'Teacher') return next();

  /* Parent — must own the child */
  if (session.role === 'Parent') {
    const linked = Array.isArray(session.children) &&
      session.children.some(c => c.studentId === studentId);

    if (!linked) {
      return res.status(403).json({
        success:    false,
        error:      `You do not have permission to view records for student ${studentId}.`,
        statusCode: 403,
      });
    }
    return next();
  }

  return res.status(403).json({ success: false, error: 'Forbidden.', statusCode: 403 });
}

/* ─────────────────────────────────────────────────────────────
   classAccessGuard(req, res, next)
   ─────────────────────────────────────────────────────────────
   Ensures a Teacher can only access resources for their own
   assigned class/arm. Requires:
     req.resolvedClass  — the student's class  (set by controller)
     req.resolvedArm    — the student's arm

   The controller that resolves the student record should set
   these before this guard runs, OR the guard can be called
   after the controller populates req.targetStudent.
───────────────────────────────────────────────────────────── */
function classAccessGuard(req, res, next) {
  const session = req.shcSession;
  if (!session) return _unauthorized(res, 'Not authenticated.');
  if (session.role === 'Admin') return next();

  if (session.role === 'Teacher') {
    const targetClass = req.resolvedClass || req.targetStudent?.class;
    const targetArm   = req.resolvedArm   || req.targetStudent?.arm;

    if (
      targetClass &&
      targetArm   &&
      (session.assignedClass !== targetClass || session.assignedArm !== targetArm)
    ) {
      return res.status(403).json({
        success:    false,
        error:      `You are only authorised to access ${session.assignedClass} ${session.assignedArm} records.`,
        statusCode: 403,
      });
    }
    return next();
  }

  return next();   // other roles handled by requireRole
}

/* ─────────────────────────────────────────────────────────────
   rateLimiter
   ─────────────────────────────────────────────────────────────
   60 requests per IP per minute on all portal API routes.
   Separately, a stricter limiter is applied to the login endpoint
   in server.js (via loginRateLimiter below).
───────────────────────────────────────────────────────────── */
const rateLimiter = rateLimit({
  windowMs: 60 * 1000,    // 1 minute window
  max:      60,           // max requests per window
  standardHeaders: true,  // Return rate limit info in RateLimit-* headers
  legacyHeaders:   false,
  message: {
    success:    false,
    error:      'Too many requests. Please wait a moment and try again.',
    statusCode: 429,
  },
  skip: (req) => req.path === '/api/health',   // don't rate-limit health checks
});

/* Stricter limiter for the login endpoint: 10 attempts per 15 min */
const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,   // 15 minutes
  max:      10,
  standardHeaders: true,
  legacyHeaders:   false,
  message: {
    success:    false,
    error:      'Too many login attempts. Please try again in 15 minutes.',
    statusCode: 429,
  },
});

/* ─────────────────────────────────────────────────────────────
   PRIVATE HELPER
───────────────────────────────────────────────────────────── */
function _unauthorized(res, message) {
  return res.status(401).json({
    success:    false,
    error:      message,
    statusCode: 401,
    redirect:   '/login.html',
  });
}

module.exports = {
  authMiddleware,
  requireRole,
  childAccessGuard,
  classAccessGuard,
  rateLimiter,
  loginRateLimiter,
};