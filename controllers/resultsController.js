'use strict';

const check  = require('./checkResultController');
const card   = require('./reportCardController');

const stub = (name) => (_req, res) =>
  res.status(501).json({ ok: false, message: `${name} not yet implemented.` });

exports.getStudentResults = check.getResultSheet;
exports.getReportCard     = check.getReportCard;
exports.getRemarks        = (req, res) => card.getOne(req, res);
exports.getClassResults   = card.classSummary;
exports.getClassSummary   = card.classSummary;
exports.exportResults     = stub('exportResults');
exports.upsert            = stub('upsert');
exports.bulkUpsert        = stub('bulkUpsert');
exports.saveRemarks       = card.saveRemark;
exports.getDomains        = card.getDomains;
exports.saveDomains       = card.setDomains;
exports.getOne            = card.getOne;
exports.update            = stub('update');
exports.remove            = stub('remove');
