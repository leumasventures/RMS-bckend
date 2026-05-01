'use strict';

const express            = require('express');
const reFormController   = require('../controllers/reFormController');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

// named sub-routes before /:id
router.get ('/student/:studentId',  authorize('Admin', 'Teacher'), reFormController.getByStudent);
router.get ('/',                    authorize('Admin', 'Teacher'), reFormController.getAll);
router.get ('/:id',                 authorize('Admin', 'Teacher'), reFormController.getOne);
router.post('/',                    authorize('Admin'),            reFormController.create);
router.put ('/:id',                 authorize('Admin'),            reFormController.update);
router.patch('/:id/approve',        authorize('Admin'),            reFormController.approve);
router.patch('/:id/reject',         authorize('Admin'),            reFormController.reject);
router.delete('/:id',               authorize('Admin'),            reFormController.remove);

module.exports = router;