'use strict';

/**
 * authRoutes.js — Sacred Heart College (SAHARCO)
 * Mount at: /api/auth
 *
 * Public (no token):
 *   POST /api/auth/login
 *   POST /api/auth/refresh
 *   POST /api/auth/forgot-password
 *   POST /api/auth/reset-password
 *
 * Protected (token required):
 *   GET  /api/auth/me
 *   POST /api/auth/logout
 *   POST /api/auth/change-password
 */

const express        = require('express');
const authController = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

/* ── Public ──────────────────────────────────────────────────────────────── */
router.post('/login',           authController.login);
router.post('/refresh',         authController.refreshToken);
router.post('/forgot-password', authController.forgotPassword);
router.post('/reset-password',  authController.resetPassword);

/* ── Protected (authenticate from here down) ─────────────────────────────── */
router.use(authenticate);

router.get ('/me',              authController.getMe);
router.post('/logout',          authController.logout);
router.post('/change-password', authController.changePassword);

module.exports = router;