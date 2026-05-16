'use strict';
const express  = require('express');
const ac       = require('../controllers/archiveController');
const { authenticate, authorize } = require('../middleware/auth');
const router   = express.Router();
const admin    = authorize('Admin');
router.use(authenticate);

router.get('/stats',                   ac.getStats);
router.get('/students/export/csv',     admin, ac.exportStudentsCSV);
router.get('/students',                ac.getAllStudents);
router.get('/students/:id',            ac.getOneStudent);
router.post('/students/:studentId',    admin, ac.archiveStudent);
router.delete('/students/:id/restore', admin, ac.restoreStudent);
router.get('/staff/export/csv',        admin, ac.exportStaffCSV);
router.get('/staff',                   ac.getAllStaff);
router.get('/staff/:id',               ac.getOneStaff);
router.post('/staff/:staffId',         admin, ac.archiveStaff);
router.delete('/staff/:id/restore',    admin, ac.restoreStaff);

module.exports = router;
