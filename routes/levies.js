'use strict';
const express  = require('express');
const lc       = require('../controllers/levyController');
const { authenticate, authorize } = require('../middleware/auth');
const router   = express.Router();
const admin    = authorize('Admin');
router.use(authenticate);

router.get('/',                   lc.getAll);
router.post('/',                  admin, lc.create);
router.get('/student/:studentId', lc.getStudentLevies);
router.get('/:id',                lc.getOne);
router.put('/:id',                admin, lc.update);
router.delete('/:id',             admin, lc.remove);
router.post('/:id/charge',        admin, lc.chargeLevy);
router.get('/:id/payments',       lc.getLevyPayments);
router.patch('/payments/:pmtId',  admin, lc.updatePayment);

module.exports = router;
