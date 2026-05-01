/* ============================================================
   Sacred Heart College Eziukwu Aba – School Portal
   server.js  |  Express Application Entry Point
   ============================================================ */

'use strict';

require('dotenv').config();

const express    = require('express');
const path       = require('path');
const cors       = require('cors');
const helmet     = require('helmet');
const morgan     = require('morgan');
const session    = require('express-session');

const portalRoutes = require('./routes/routes');

const app  = express();
const PORT = process.env.PORT || 5000;
const ENV  = process.env.NODE_ENV || 'development';

/* ─────────────────────────────────────────────────────────────
   BANNER  (matches the running console output)
───────────────────────────────────────────────────────────── */
function printBanner() {
  console.log('╔══════════════════════════════════════════╗');
  console.log('║    Sacred Heart College — API Server     ║');
  console.log('╚══════════════════════════════════════════╝');
  console.log(`  ➜  Listening on http://localhost:${PORT}`);
  console.log(`  ➜  Environment: ${ENV}`);
  console.log(`  ➜  Health: http://localhost:${PORT}/api/health`);
  console.log('');
}

/* ─────────────────────────────────────────────────────────────
   SECURITY HEADERS
   Content-Security-Policy is relaxed here for development;
   tighten for production (remove 'unsafe-inline' etc.).
───────────────────────────────────────────────────────────── */
app.use(
  helmet({
    contentSecurityPolicy: ENV === 'production'
      ? undefined          // use helmet defaults in prod
      : false,             // disable in dev for easier debugging
  })
);

/* ─────────────────────────────────────────────────────────────
   CORS
   In production, replace the origin array with your real domain.
───────────────────────────────────────────────────────────── */
app.use(
  cors({
    origin: ENV === 'production'
      ? ['https://shc.edu.ng', 'https://portal.shc.edu.ng']
      : ['http://localhost:5000', 'http://127.0.0.1:5500', 'null'],
    credentials: true,
    methods:     ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-shc-session'],
  })
);

/* ─────────────────────────────────────────────────────────────
   BODY PARSERS
───────────────────────────────────────────────────────────── */
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

/* ─────────────────────────────────────────────────────────────
   HTTP REQUEST LOGGER
   'dev' format in development; 'combined' in production.
───────────────────────────────────────────────────────────── */
app.use(morgan(ENV === 'production' ? 'combined' : 'dev'));

/* ─────────────────────────────────────────────────────────────
   SESSION  (server-side)
   In production replace secret with a long random env variable.
   Consider connect-mongo or connect-pg-simple for persistence.
───────────────────────────────────────────────────────────── */
app.use(
  session({
    name:   'shc_sid',
    secret: process.env.SESSION_SECRET || 'shc_dev_secret_change_in_prod',
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure:   ENV === 'production',   // HTTPS only in prod
      httpOnly: true,
      sameSite: 'lax',
      maxAge:   8 * 60 * 60 * 1000,    // 8 hours
    },
  })
);

/* ─────────────────────────────────────────────────────────────
   STATIC FILES
   Serve HTML / CSS / client JS from the public/ folder.
   parentsPortal.html, checkResult.html, login.html, etc.
───────────────────────────────────────────────────────────── */
app.use(express.static(path.join(__dirname, 'public')));

/* ─────────────────────────────────────────────────────────────
   HEALTH CHECK  (/api/health)
   Returns server status, uptime, and environment.
   No auth required — used by load-balancers / monitoring.
───────────────────────────────────────────────────────────── */
app.get('/api/health', (req, res) => {
  res.status(200).json({
    success:     true,
    status:      'ok',
    school:      'Sacred Heart College Eziukwu Aba',
    environment: ENV,
    uptime:      `${Math.floor(process.uptime())}s`,
    timestamp:   new Date().toISOString(),
    version:     process.env.npm_package_version || '1.0.0',
  });
});

/* ─────────────────────────────────────────────────────────────
   LOGIN ENDPOINT
   Handles POST /api/auth/login from the login page.
   Validates credentials against the USERS store (login.js logic
   mirrored here in the backend) and writes the session.
───────────────────────────────────────────────────────────── */
const { USERS, STUDENTS, PRIVILEGES, resolveChildren } = require('./data/users');

app.post('/api/auth/login', (req, res) => {
  const { role, username, password } = req.body;

  /* Basic input guard */
  if (!role || !username || !password) {
    return res.status(400).json({ success: false, error: 'role, username and password are required.' });
  }

  const roleMap = { admin: 'Admin', teacher: 'Teacher', parent: 'Parent' };
  const expectedRole = roleMap[role.toLowerCase()];
  if (!expectedRole) {
    return res.status(400).json({ success: false, error: 'Invalid role.' });
  }

  const user = USERS.find(u =>
    (u.username === username || u.email === username) &&
    u.password  === password &&
    u.role      === expectedRole
  );

  if (!user) {
    return res.status(401).json({ success: false, error: 'Invalid credentials.' });
  }

  /* Build session object */
  const sessionData = {
    name:          user.name,
    role:          user.role,
    email:         user.email         || '',
    teacherId:     user.teacherId     || null,
    assignedClass: user.assignedClass || null,
    assignedArm:   user.assignedArm   || null,
    children:      resolveChildren(user),
    privileges:    PRIVILEGES[user.role],
    loggedInAt:    Date.now(),
  };

  req.session.shc_session = sessionData;

  return res.status(200).json({
    success:  true,
    message:  'Login successful.',
    role:     sessionData.role,
    name:     sessionData.name,
    redirect: sessionData.role === 'Parent'
      ? '/parentsPortal.html'
      : '/dashboard.html',
  });
});

/* ─────────────────────────────────────────────────────────────
   LOGOUT
───────────────────────────────────────────────────────────── */
app.post('/api/auth/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) return res.status(500).json({ success: false, error: 'Logout failed.' });
    res.clearCookie('shc_sid');
    res.status(200).json({ success: true, message: 'Logged out.' });
  });
});

/* ─────────────────────────────────────────────────────────────
   SESSION STATUS  (for client-side auth check on page load)
───────────────────────────────────────────────────────────── */
app.get('/api/auth/me', (req, res) => {
  const s = req.session?.shc_session;
  if (!s) return res.status(401).json({ success: false, error: 'Not authenticated.' });
  res.status(200).json({
    success: true,
    data: {
      name:          s.name,
      role:          s.role,
      assignedClass: s.assignedClass,
      assignedArm:   s.assignedArm,
      children:      s.children,   // null for non-parents
    },
  });
});

/* ─────────────────────────────────────────────────────────────
   PORTAL API ROUTES
   All /api/parent-portal/* and /api/check-result/* routes.
───────────────────────────────────────────────────────────── */
app.use('/api', portalRoutes);

/* ─────────────────────────────────────────────────────────────
   SPA FALLBACK
   Any non-API GET that doesn't match a static file gets
   index.html (or login.html) so client-side routing works.
───────────────────────────────────────────────────────────── */
app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ success: false, error: 'API endpoint not found.' });
  }
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

/* ─────────────────────────────────────────────────────────────
   GLOBAL ERROR HANDLER
───────────────────────────────────────────────────────────── */
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
  const statusCode = err.statusCode || err.status || 500;
  if (ENV !== 'production') console.error('[SHC Error]', err);

  res.status(statusCode).json({
    success:    false,
    error:      err.message || 'Internal server error.',
    ...(ENV !== 'production' && { stack: err.stack }),
  });
});

/* ─────────────────────────────────────────────────────────────
   START SERVER
───────────────────────────────────────────────────────────── */
app.listen(PORT, () => printBanner());

module.exports = app;   // exported for test runners (Jest, Supertest)