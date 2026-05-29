'use strict';
const express = require('express');
const ctrl    = require('../controllers/messagingController');
const { authenticate, authorize } = require('../middleware/auth');

const router    = express.Router();
const adminOnly = authorize('Admin');

router.options('*', (_req, res) => res.sendStatus(204));
router.use(authenticate);

router.get('/status',               adminOnly, ctrl.getStatus);
router.get('/preview',              adminOnly, ctrl.preview);
router.get('/log',                  adminOnly, ctrl.getLog);
router.post('/send',                adminOnly, ctrl.send);
router.post('/send-admission-ack',  adminOnly, ctrl.sendAdmissionAck);
router.post('/send-approval',       adminOnly, ctrl.sendApproval);

/* ── Diagnostic: send a real test email ─────────────────────────── */
router.post('/test-email', adminOnly, async (req, res) => {
  const { to } = req.body || {};
  if (!to) return res.status(400).json({ success: false, message: 'Provide { "to": "email@example.com" }' });

  const cfg = {
    EMAIL_HOST:    process.env.EMAIL_HOST    || '(not set)',
    EMAIL_PORT:    process.env.EMAIL_PORT    || '(not set)',
    EMAIL_USER:    process.env.EMAIL_USER    || '(not set)',
    EMAIL_PASS:    process.env.EMAIL_PASS    ? '***set***' : '(not set)',
    EMAIL_ENABLED: process.env.EMAIL_ENABLED || '(not set)',
  };

  try {
    const emailSvc = require('../services/emailService');
    if (!emailSvc.isEnabled()) {
      return res.json({ success: false, message: 'EMAIL_ENABLED is not "true"', config: cfg });
    }
    const result = await emailSvc.sendEmail({
      to,
      subject: 'Test Email — Sacred Heart College Portal',
      html: `<div style="font-family:sans-serif;padding:20px;">
        <h2 style="color:#1e3a5f;">✅ Test Email</h2>
        <p>This is a test from Sacred Heart College Portal.</p>
        <p>If you received this, email is working correctly.</p>
        <p style="color:#9ca3af;font-size:12px;">Sent: ${new Date().toISOString()}</p>
      </div>`,
    });
    return res.json({ success: true, message: `Email sent to ${to}`, messageId: result.messageId, config: cfg });
  } catch (e) {
    return res.status(500).json({ success: false, message: e.message, code: e.code || null, config: cfg });
  }
});

module.exports = router;