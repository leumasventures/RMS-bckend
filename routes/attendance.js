'use strict';

const express                = require('express');
const attendanceController   = require('../controllers/attendanceController');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

// summary must come before /:id to avoid Express treating "summary" as an id
router.get ('/summary/:studentId',  attendanceController.getSummary);
router.get ('/',                    attendanceController.getAll);
router.post('/bulk',  authorize('Admin', 'Teacher'), attendanceController.bulkMark);
router.post('/',      authorize('Admin', 'Teacher'), attendanceController.mark);
router.put ('/:id',   authorize('Admin', 'Teacher'), attendanceController.update);
router.delete('/:id', authorize('Admin'),             attendanceController.remove);

module.exports = router;