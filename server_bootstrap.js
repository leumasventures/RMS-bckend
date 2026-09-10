'use strict';

/**
 * server.js (or app.js) — Sacred Heart College Bootstrap
 * ────────────────────────────────────────────────────────
 * Add ONE line to your existing Express entry point:
 *
 *   const db = require('./config/db');
 *   ...
 *   app.listen(PORT, async () => {
 *     await db.sync();   // ← add this
 *     console.log(`Server running on port ${PORT}`);
 *   });
 *
 * Or use this file as-is if you don't have a server.js yet.
 * ────────────────────────────────────────────────────────
 *
 * ENV VARS (set in .env or hosting panel):
 *   DB_HOST=localhost
 *   DB_PORT=3306
 *   DB_USER=u156099858_shcaba
 *   DB_PASS=your_password
 *   DB_NAME=u156099858_shcaba_db
 *   PORT=3000
 *   PORTAL_URL=https://sacredheartcollegeaba.com
 *   JWT_SECRET=change_me_in_production
 */

require('dotenv').config();
const express    = require('express');
const cookieParser = require('cookie-parser');
const cors       = require('cors');
const db         = require('./config/db');

const app  = express();
const PORT = process.env.PORT || 3000;

/* ── middleware ─────────────────────────────────────────────── */
app.use(cors({ origin: process.env.PORTAL_URL || true, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

/* ── auth middleware stub ───────────────────────────────────── */
// Replace this with your real JWT/session middleware.
// Every controller expects req.user = { id, name, role, assignedClass, assignedArm, wardId }.
app.use('/api', (req, res, next) => {
  // TODO: verify JWT cookie / Bearer token and set req.user
  // For development: inject a default Admin user so controllers don't crash.
  if (!req.user) {
    req.user = { id: 1, name: 'Admin', role: 'Admin', assignedClass: null, assignedArm: null, wardId: null };
  }
  next();
});

/* ── routes ─────────────────────────────────────────────────── */
// Wire each controller to its route file.
// Example — uncomment and adjust paths to match your project structure:
//
// const adminRoutes      = require('./routes/adminRoutes');
// const classRoutes      = require('./routes/classRoutes');
// const studentRoutes    = require('./routes/studentRoutes');
// const staffRoutes      = require('./routes/staffRoutes');
// const subjectRoutes    = require('./routes/subjectRoutes');
// const resultRoutes     = require('./routes/resultRoutes');
// const attendanceRoutes = require('./routes/attendanceRoutes');
// const feeRoutes        = require('./routes/feeRoutes');
// const admissionRoutes  = require('./routes/admissionRoutes');
// const reFormRoutes     = require('./routes/reFormRoutes');
// const reportCardRoutes = require('./routes/reportCardRoutes');
// const tokenRoutes      = require('./routes/accessTokenRoutes');
// const checkResultRoutes= require('./routes/checkResultRoutes');
//
// app.use('/api/admin',         adminRoutes);
// app.use('/api/classes',       classRoutes);
// app.use('/api/students',      studentRoutes);
// app.use('/api/staff',         staffRoutes);
// app.use('/api/subjects',      subjectRoutes);
// app.use('/api/results',       resultRoutes);
// app.use('/api/attendance',    attendanceRoutes);
// app.use('/api/fees',          feeRoutes);
// app.use('/api/admissions',    admissionRoutes);
// app.use('/api/reforms',       reFormRoutes);
// app.use('/api/report-cards',  reportCardRoutes);
// app.use('/api/access-tokens', tokenRoutes);
// app.use('/api/check-result',  checkResultRoutes);

/* ── quick inline admin settings routes (if you don't have route files yet) */
const adminCtrl = require('./controllers/adminController');
app.get ('/api/admin/settings', adminCtrl.getSettings);
app.post('/api/admin/settings', adminCtrl.updateSettings);

/* ── health check ────────────────────────────────────────────── */
app.get('/api/health', async (req, res) => {
  try {
    await db.pool.query('SELECT 1');
    res.json({ status: 'ok', db: 'connected', students: db.students.length });
  } catch (err) {
    res.status(500).json({ status: 'error', db: err.message });
  }
});

/* ── 404 / error handlers ────────────────────────────────────── */
app.use((req, res) => res.status(404).json({ success: false, message: 'Route not found.' }));
app.use((err, req, res, _next) => {
  console.error(err);
  res.status(500).json({ success: false, message: err.message || 'Internal server error.' });
});

/* ── start ───────────────────────────────────────────────────── */
app.listen(PORT, async () => {
  try {
    await db.sync();        // ← loads MySQL data into in-memory caches
    console.log(`✅ SAHARCO server running on port ${PORT}`);
  } catch (err) {
    console.error('❌ DB sync failed:', err.message);
    console.error('   Check your DB_* env vars and that schema.sql has been run.');
  }
});

module.exports = app;