const express = require('express');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const db      = require('../config/db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

/* ── POST /api/auth/login ─────────────────── */
router.post('/login', (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ success: false, message: 'Email and password are required.' });
  }

  const user = db.findUserByEmail(email);
  if (!user) {
    return res.status(401).json({ success: false, message: 'Invalid credentials.' });
  }

  const match = bcrypt.compareSync(password, user.passwordHash);
  if (!match) {
    return res.status(401).json({ success: false, message: 'Invalid credentials.' });
  }

  const token = jwt.sign(
    { id: user.id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
  );

  res.json({
    success: true,
    token,
    user: {
      id:             user.id,
      name:           user.name,
      email:          user.email,
      role:           user.role,
      assignedClass:  user.assignedClass || null,
      assignedArm:    user.assignedArm   || null,
    },
  });
});

/* ── GET /api/auth/me ─────────────────────── */
router.get('/me', authenticate, (req, res) => {
  const { passwordHash, ...safe } = req.user;
  res.json({ success: true, user: safe });
});

module.exports = router;