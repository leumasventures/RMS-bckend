'use strict';
const express = require('express');
const ctrl    = require('../controllers/messagingController');
const { authenticate, authorize } = require('../middleware/auth');

const router    = express.Router();
const adminOnly = authorize('Admin');

router.options('*', (_req, res) => res.sendStatus(204));
router.use(authenticate);

router.get('/status',           adminOnly, ctrl.getStatus);
router.get('/preview',          adminOnly, ctrl.preview);
router.get('/log',              adminOnly, ctrl.getLog);
router.post('/send',            adminOnly, ctrl.send);
router.post('/send-admission-ack',  adminOnly, ctrl.sendAdmissionAck);
router.post('/send-approval',   adminOnly, ctrl.sendApproval);

module.exports = router;