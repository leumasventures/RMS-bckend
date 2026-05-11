/* ============================================================
   Sacred Heart College Eziukwu Aba – School Portal
   server.js  |  Express Application Entry Point
   ============================================================ */

'use strict';

require('dotenv').config();

const express    = require('express');
const cors       = require('cors');
const helmet     = require('helmet');
const morgan     = require('morgan');
const session    = require('express-session');
const MySQLStore = require('express-mysql-session')(session);
const db         = require('./config/db');

const app  = express();
const PORT = process.env.PORT || 5000;
const ENV  = process.env.NODE_ENV || 'development';

/* ─────────────────────────────────────────────────────────────
   BANNER
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
───────────────────────────────────────────────────────────── */
app.use(
  helmet({
    contentSecurityPolicy: ENV === 'production' ? undefined : false,
  })
);

/* ─────────────────────────────────────────────────────────────
   CORS
───────────────────────────────────────────────────────────── */
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
  : ['https://sacredheartcollegeaba.com', 'https://www.sacredheartcollegeaba.com'];

app.use(
  cors({
    origin:         ENV === 'production' ? allowedOrigins : true,
    credentials:    true,
    methods:        ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-shc-session'],
  })
);

/* ─────────────────────────────────────────────────────────────
   BODY PARSERS
───────────────────────────────────────────────────────────── */
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

/* ─────────────────────────────────────────────────────────────
   HTTP REQUEST LOGGER
───────────────────────────────────────────────────────────── */
app.use(morgan(ENV === 'production' ? 'combined' : 'dev'));

/* ─────────────────────────────────────────────────────────────
   SESSION  (MySQL-backed — no MemoryStore in production)
───────────────────────────────────────────────────────────── */
const sessionStore = new MySQLStore({
  host:                    process.env.DB_HOST,
  port:                    parseInt(process.env.DB_PORT || '3306', 10),
  user:                    process.env.DB_USER,
  password:                process.env.DB_PASS,
  database:                process.env.DB_NAME,
  clearExpired:            true,
  checkExpirationInterval: 15 * 60 * 1000,   // prune expired rows every 15 min
  expiration:               8 * 60 * 60 * 1000,
});

app.use(
  session({
    name:              'shc_sid',
    secret:            process.env.SESSION_SECRET || 'shc_dev_secret_change_in_prod',
    store:             sessionStore,
    resave:            false,
    saveUninitialized: false,
    cookie: {
      secure:   ENV === 'production',
      httpOnly: true,
      sameSite: ENV === 'production' ? 'strict' : 'lax',
      maxAge:   8 * 60 * 60 * 1000,   // 8 hours
    },
  })
);

/* ─────────────────────────────────────────────────────────────
   HEALTH CHECK
───────────────────────────────────────────────────────────── */
app.get('/api/health', async (req, res) => {
  try {
    await db.pool.query('SELECT 1');
    res.status(200).json({
      success:     true,
      status:      'ok',
      db:          'connected',
      school:      'Sacred Heart College Eziukwu Aba',
      environment: ENV,
      uptime:      `${Math.floor(process.uptime())}s`,
      timestamp:   new Date().toISOString(),
      version:     process.env.npm_package_version || '1.0.0',
      cache: {
        classes:  db.classes.length,
        students: db.students.length,
        staff:    db.staff.length,
        users:    db.users.length,
      },
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      status:  'error',
      db:      err.message,
    });
  }
});

/* ─────────────────────────────────────────────────────────────
   ROUTES
   Order matters — specific routes before the portal catch-all.
───────────────────────────────────────────────────────────── */
app.use('/api/auth',          require('./routes/auth'));
app.use('/api/classes',       require('./routes/class'));
app.use('/api/students',      require('./routes/students'));
app.use('/api/staff',         require('./routes/staff'));
app.use('/api/subjects',      require('./routes/subjects'));
app.use('/api/results',       require('./routes/results'));
app.use('/api/attendance',    require('./routes/attendance'));
app.use('/api/fees',          require('./routes/fees'));
app.use('/api/admissions',    require('./routes/admission'));
app.use('/api/reforms',       require('./routes/reforms'));
app.use('/api/report-cards',  require('./routes/reportCard'));
app.use('/api/notifications', require('./routes/notification'));
app.use('/api/access-tokens', require('./routes/accesstoken'));
app.use('/api/timetable',     require('./routes/timetable'));
app.use('/api/admin/settings',require('./routes/admin'));
// Portal + check-result last — its catch-all must not swallow other routes
app.use('/api',               require('./routes/routes'));

/* ─────────────────────────────────────────────────────────────
   404
───────────────────────────────────────────────────────────── */
app.use((req, res) => {
  res.status(404).json({ success: false, error: `Cannot ${req.method} ${req.path}` });
});

/* ─────────────────────────────────────────────────────────────
   GLOBAL ERROR HANDLER
───────────────────────────────────────────────────────────── */
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
  const statusCode = err.statusCode || err.status || 500;
  if (ENV !== 'production') console.error('[SHC Error]', err);
  res.status(statusCode).json({
    success: false,
    error:   err.message || 'Internal server error.',
    ...(ENV !== 'production' && { stack: err.stack }),
  });
});

/* ─────────────────────────────────────────────────────────────
   START SERVER
───────────────────────────────────────────────────────────── */
app.listen(PORT, async () => {
  printBanner();
  try {
    await db.sync();
  } catch (err) {
    console.error('❌ DB sync failed:', err.message);
    console.error('   Check DB_* env vars and that schema.sql has been run.');
  }
});

module.exports = app;