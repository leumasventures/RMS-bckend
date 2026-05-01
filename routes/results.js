'use strict';
const express = require('express');
const resultController = require('../controllers/resultController');
const { authenticate, authorize } = require('../middleware/auth');
const router = express.Router();
router.use(authenticate);

router.get   ('/stats',                  resultController.getStats);
router.get   ('/report-card/:studentId', resultController.getReportCard);
router.get   ('/',                       resultController.getAll);
router.post  ('/bulk',  authorize('Admin','Teacher'), resultController.bulkCreate);
router.post  ('/',      authorize('Admin','Teacher'), resultController.create);
router.put   ('/:id',   authorize('Admin','Teacher'), resultController.update);
router.delete('/:id',   authorize('Admin'),           resultController.remove);

module.exports = router;