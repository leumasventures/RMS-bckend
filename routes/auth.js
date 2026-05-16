'use strict';

const express          = require('express');
const authController   = require('../controllers/authController');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

/* ── Public — NO token required ─────────────────────────────────────────── */
router.post('/login',           authController.login);
router.post('/refresh',         authController.refreshToken);
router.post('/forgot-password', authController.forgotPassword);
router.post('/reset-password',  authController.resetPassword);
router.post('/signup-request',  authController.signupRequest);   // public — anyone can submit

/* ── Protected — token required from here down ───────────────────────────── */
router.use(authenticate);

router.get ('/me',              authController.getMe);
router.post('/logout',          authController.logout);
router.post('/change-password', authController.changePassword);

/* ── Admin only ─────────────────────────────────────────────────────────── */
router.get  ('/signup-requests',      authorize('Admin'), authController.getSignupRequests);
router.patch('/signup-requests/:id',  authorize('Admin'), authController.reviewSignupRequest);

module.exports = router;