'use strict';
const express        = require('express');
const userController = require('../controllers/userController');
const { authenticate, authorize } = require('../middleware/auth');

const router    = express.Router();
const adminOnly = authorize('Admin');

router.use(authenticate);
router.use(adminOnly);

router.get('/',                   userController.getAll);
router.get('/:id',                userController.getOne);
router.post('/',                  userController.create);
router.put('/:id',                userController.update);
router.patch('/:id/status',       userController.setStatus);
router.patch('/:id/password',     userController.resetPassword);
router.delete('/:id',             userController.remove);

module.exports = router;
