const express = require('express');
const router = express.Router();

// Adjust these two requires to match your actual auth middleware file/exports
const { authenticate, authorize } = require('../middleware/auth');
const transcriptController = require('../controllers/transcriptController');

router.get('/',        authenticate, authorize('Admin'), transcriptController.getTranscript);
router.get('/profile', authenticate, authorize('Admin'), transcriptController.getProfile);

module.exports = router;