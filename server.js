'use strict';
require('dotenv').config();

const express      = require('express');
const cookieParser = require('cookie-parser');
const cors         = require('cors');
const path         = require('path');

const app = express();

/* ── CORS ── */
app.use(cors({
  origin: true,
  credentials: true,
  methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

/* ── Static uploads ── */
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

/* ── Health check ── */
app.get('/api/health', (_req, res) => res.json({ status: 'ok', ts: Date.now() }));

/* ── Routes ── */
app.use('/api/auth',       require('./routes/auth'));
app.use('/api/classes',    require('./routes/classes'));
app.use('/api/students',   require('./routes/students'));
app.use('/api/staff',      require('./routes/staff'));
app.use('/api/teachers',   require('./routes/staff'));
app.use('/api/subjects',   require('./routes/subjects'));
app.use('/api/results',    require('./routes/results'));
app.use('/api/attendance', require('./routes/attendance'));
app.use('/api/fixtures',   require('./routes/fixtures'));
app.use('/api/notices',    require('./routes/notices'));
app.use('/api/admin',      require('./routes/admin'));

/* ── 404 handler ── */
app.use((_req, res) => res.status(404).json({ message: 'Route not found.' }));

/* ── Global error handler ── */
app.use((err, _req, res, _next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ message: err.message || 'Internal server error.' });
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
