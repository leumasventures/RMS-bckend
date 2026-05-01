'use strict';
const express         = require('express');
const classController = require('../controllers/classController');
const { authenticate } = require('../middleware/auth');
const router = express.Router();
router.use(authenticate);

router.get('/',                  classController.getAll);
router.get('/:name',             classController.getOne);
router.get('/:name/students',    classController.getStudents);

module.exports = router;