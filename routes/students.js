'use strict';
const express = require('express');
const studentController = require('../controllers/studentController');
const { authenticate, authorize } = require('../middleware/auth');
const router = express.Router();
router.use(authenticate);

router.get   ('/',    studentController.getAll);
router.get   ('/:id', studentController.getOne);
router.post  ('/',    authorize('Admin'), studentController.create);
router.put   ('/:id', authorize('Admin'), studentController.update);
router.delete('/:id', authorize('Admin'), studentController.remove);

module.exports = router;