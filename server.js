'use strict';
require('dotenv').config();

const express      = require('express');
const cookieParser = require('cookie-parser');
const cors         = require('cors');
const path         = require('path');

const app = express();

/* ── CORS ── */
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);

// Fallback list covers local dev + the production frontend domain
const DEFAULT_ORIGINS = [
  'https://sacredheartcollegeaba.com',
  'https://www.sacredheartcollegeaba.com',
  'http://localhost:3000',
  'http://localhost:5000',
  'http://localhost:5002',
  'http://127.0.0.1:5500',  // Live Server (VS Code)
];

const corsOrigins = ALLOWED_ORIGINS.length ? ALLOWED_ORIGINS : DEFAULT_ORIGINS;

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (curl, Postman, server-to-server)
    if (!origin) return callback(null, true);
    if (corsOrigins.includes(origin)) return callback(null, true);
    callback(new Error(`CORS: origin '${origin}' not allowed.`));
  },
  credentials: true,
  methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

/* ── Static uploads ── */
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.get('/favicon.ico', (req, res) => res.status(204).end());

/* ── Health check ── */
app.get('/api/health', (_req, res) => res.json({ status: 'ok', ts: Date.now() }));

/* ── Routes ── */
app.use('/api/auth',            require('./routes/auth'));
app.use('/api/classes',         require('./routes/classes'));
app.use('/api/messaging',        require('./routes/messaging'));
app.use('/api/admissions',       require('./routes/admissions'));
app.use('/api/students',        require('./routes/students'));
app.use('/api/staff',           require('./routes/staff'));
app.use('/api/teachers',        require('./routes/staff'));
app.use('/api/subjects',        require('./routes/subjects'));
app.use('/api/results',         require('./routes/results'));
app.use('/api/attendance',      require('./routes/attendance'));
app.use('/api/fixtures',        require('./routes/fixtures'));
app.use('/api/notices',         require('./routes/notices'));
app.use('/api/admin',           require('./routes/admin'));
app.use('/api/fees',              require('./routes/fees'));
app.use('/api/levies',            require('./routes/levies'));
app.use('/api/student-finance',   require('./routes/studentFinance'));
app.use('/api/access-tokens',     require('./routes/accesstoken'));
app.use('/api/users',           require('./routes/users'));
app.use('/api/timetable',       require('./routes/timetable'));
app.use('/api/archive',         require('./routes/archive'));

/* ── 404 handler ── */
app.use((_req, res) => res.status(404).json({ message: 'Route not found.' }));

/* ── Global error handler ── */
app.use((err, req, res, _next) => {
  console.error('Unhandled error:', err.message || err);
  // Always echo CORS headers on error so browser can read the response
  const origin  = req.headers.origin;
  const allowed = [
    'https://sacredheartcollegeaba.com',
    'https://www.sacredheartcollegeaba.com',
    'http://localhost:3000', 'http://localhost:5000',
    'http://localhost:5002', 'http://127.0.0.1:5500',
  ];
  if (origin && allowed.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
  const status = err.status || err.statusCode || 500;
  res.status(status).json({ success: false, message: err.message || 'Internal server error.' });
});

const db   = require('./config/db');
const PORT = process.env.PORT || 5002;
app.listen(PORT, async () => {
  console.log(`\n🚀 SHC API running on port ${PORT}`);
  console.log(`   Health: http://localhost:${PORT}/api/health\n`);
  try {
    await db.sync();
  } catch (err) {
    console.error('[db] sync failed:', err.message);
  }
});

module.exports = app;