'use strict';
const express         = require('express');
const adminController = require('../controllers/adminController');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

router.get('/',  authorize('Admin'), adminController.getSettings);
router.post('/', authorize('Admin'), adminController.updateSettings);

module.exports = router;