'use strict';
const express         = require('express');
const adminController = require('../controllers/adminController');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

router.get('/',  authorize('Admin'), adminController.getSettings);

// Public settings — available to all authenticated staff (Teacher, Admin, etc.)
// Returns only the settings needed for result entry: score breakdown, pass mark, grading scale
router.get('/public-settings', authenticate, (req, res) => {
  const db = require('../config/db');
  return res.json({
    success: true,
    data: {
      score_breakdown:   db._settings?.score_breakdown   || JSON.stringify(db.getScoreBreakdown()),
      pass_mark:         db._settings?.pass_mark         || '40',
      grading_scale:     db._settings?.grading_scale     || null,
      current_term:      db._settings?.current_term      || db.schoolInfo?.term    || '',
      current_session:   db._settings?.current_session   || db.schoolInfo?.session || '',
      _scoreBreakdown:   db.getScoreBreakdown(),
      _passMark:         db.getPassMark(),
    }
  });
});

// Public settings — available to all authenticated staff (Teacher, Admin, etc.)
// Returns only the settings needed for result entry: score breakdown, pass mark, grading scale
router.get('/public-settings', authenticate, (req, res) => {
  const db = require('../config/db');
  return res.json({
    success: true,
    data: {
      score_breakdown:   db._settings?.score_breakdown   || JSON.stringify(db.getScoreBreakdown()),
      pass_mark:         db._settings?.pass_mark         || '40',
      grading_scale:     db._settings?.grading_scale     || null,
      current_term:      db._settings?.current_term      || db.schoolInfo?.term    || '',
      current_session:   db._settings?.current_session   || db.schoolInfo?.session || '',
      _scoreBreakdown:   db.getScoreBreakdown(),
      _passMark:         db.getPassMark(),
    }
  });
});
router.post('/', authorize('Admin'), adminController.updateSettings);

module.exports = router;