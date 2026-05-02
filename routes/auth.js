'use strict';

/**
 * authRoutes.js — Sacred Heart College Eziukwu Aba (SAHARCO)
 * ──────────────────────────────────────────────────────────────
 * Base path (mounted in app.js): /api/auth
 *
 * Public routes  (no token required):
 *   POST  /api/auth/login
 *   POST  /api/auth/refresh
 *   POST  /api/auth/forgot-password
 *   POST  /api/auth/reset-password
 *
 * Protected routes (valid access-token cookie required):
 *   GET   /api/auth/me
 *   POST  /api/auth/logout
 *   POST  /api/auth/change-password
 */

const express        = require('express');
const authController = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// ── Public ────────────────────────────────────────────────────────────────────
// These endpoints must remain unauthenticated — the client has no token yet.

router.post('/login',           authController.login);
router.post('/refresh',         authController.refreshToken);
router.post('/forgot-password', authController.forgotPassword);
router.post('/reset-password',  authController.resetPassword);

// ── Protected (token required from here down) ─────────────────────────────────

router.use(authenticate);

router.get ('/me',              authController.getMe);
router.post('/logout',          authController.logout);
router.post('/change-password', authController.changePassword);

module.exports = router;