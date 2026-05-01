'use strict';
const bcrypt = require('bcryptjs');
const jwt    = require('jsonwebtoken');
const db     = require('../db');

exports.login = (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ success: false, message: 'Email and password are required.' });

  const user = db.findUserByEmail(email);
  if (!user || !bcrypt.compareSync(String(password), user.passwordHash))
    return res.status(401).json({ success: false, message: 'Invalid credentials.' });

  const token = jwt.sign(
    { id: user.id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
  );
  return res.json({ success: true, token, user: _safe(user) });
};

exports.getMe = (req, res) => res.json({ success: true, user: _safe(req.user) });

exports.changePassword = (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword)
    return res.status(400).json({ success: false, message: 'currentPassword and newPassword are required.' });
  if (newPassword.length < 8)
    return res.status(400).json({ success: false, message: 'New password must be at least 8 characters.' });

  const user = db.findUserById(req.user.id);
  if (!bcrypt.compareSync(String(currentPassword), user.passwordHash))
    return res.status(401).json({ success: false, message: 'Current password is incorrect.' });

  user.passwordHash = bcrypt.hashSync(newPassword, 10);
  return res.json({ success: true, message: 'Password updated successfully.' });
};

function _safe(user) {
  const { passwordHash, ...safe } = user;
  return safe;
}