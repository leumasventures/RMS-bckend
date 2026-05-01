'use strict';

const express            = require('express');
const teacherController  = require('../controllers/teacherController');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

router.get ('/',                       teacherController.getAll);
router.get ('/:id',                    teacherController.getOne);
router.get ('/:id/students',           teacherController.getStudents);
router.post('/',         authorize('Admin'), teacherController.create);
router.put ('/:id',      authorize('Admin'), teacherController.update);
router.patch('/:id/status',  authorize('Admin'), teacherController.updateStatus);
router.patch('/:id/assign-class', authorize('Admin'), teacherController.assignClass);
router.delete('/:id',    authorize('Admin'), teacherController.remove);

module.exports = router;