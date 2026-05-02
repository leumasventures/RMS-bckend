'use strict';

const express               = require('express');
const admissionController   = require('../controllers/admissionController');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

router.get ('/',                   authorize('Admin', 'Teacher'), admissionController.getAll);
router.get ('/:id',                authorize('Admin', 'Teacher'), admissionController.getOne);
router.post('/',                   authorize('Admin'),            admissionController.create);
router.put ('/:id',                authorize('Admin'),            admissionController.update);
router.patch('/:id/approve',       authorize('Admin'),            admissionController.approve);
router.patch('/:id/reject',        authorize('Admin'),            admissionController.reject);
router.patch('/:id/enrol',         authorize('Admin'),            admissionController.enrol);
router.delete('/:id',              authorize('Admin'),            admissionController.remove);

module.exports = router;