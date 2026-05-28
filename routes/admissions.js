'use strict';
const express = require('express');
const ctrl    = require('../controllers/admissionController');
const { authenticate, authorize } = require('../middleware/auth');

const router    = express.Router();
const adminOnly = authorize('Admin');

// Handle OPTIONS preflight for all routes — must be before authenticate
router.options('*', (req, res) => res.sendStatus(204));

// Public submission (no auth) — anyone can submit a registration form
router.post('/', ctrl.create);

// All other routes require authentication
router.use(authenticate);

router.get('/stats',            adminOnly, ctrl.getStats);
router.get('/debug',            adminOnly, ctrl.debug);
router.get('/export',           adminOnly, ctrl.exportAdmissions);
router.get('/',                 adminOnly, ctrl.getAll);
router.get('/:id',              adminOnly, ctrl.getOne);
router.put('/:id',              adminOnly, ctrl.update);
router.patch('/:id/approve',    adminOnly, ctrl.approve);
router.patch('/:id/reject',     adminOnly, ctrl.reject);
router.post('/:id/enroll',      adminOnly, ctrl.enroll);
router.post('/bulk-enroll',     adminOnly, ctrl.bulkEnroll);
router.delete('/:id',           adminOnly, ctrl.remove);

module.exports = router;