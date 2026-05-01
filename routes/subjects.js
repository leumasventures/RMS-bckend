'use strict';
const express           = require('express');
const subjectController = require('../controllers/subjectController');
const { authenticate }  = require('../middleware/auth');
const router = express.Router();
router.use(authenticate);

router.get('/',    subjectController.getAll);
router.get('/:id', subjectController.getOne);

module.exports = router;