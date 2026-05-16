'use strict';
const router = require('express').Router();
const ctrl   = require('../controllers/fixturesController.js');
const { authenticate, authorize } = require('../middleware/auth');

const adminOnly = authorize('Admin');

router.use(authenticate);

router.get('/',              ctrl.getAll);
router.get('/:id',           ctrl.getOne);
router.post('/',             adminOnly, ctrl.create);
router.put('/:id',           adminOnly, ctrl.update);
router.patch('/:id/score',   adminOnly, ctrl.updateScore);
router.patch('/:id/status',  adminOnly, ctrl.setStatus);
router.delete('/:id',        adminOnly, ctrl.remove);

module.exports = router;