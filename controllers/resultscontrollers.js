'use strict';
/**
 * controllers/resultsController.js
 *
 * Adapter/aggregator — maps routes/results.js expectations to the
 * existing checkResultController and reportCardController exports,
 * with stubs for endpoints not yet implemented.
 */

const check  = require('./checkResultController');
const card   = require('./reportCardController');

/* ── helpers ─────────────────────────────────────────────────────────── */
const stub = (name) => (_req, res) =>
  res.status(501).json({ ok: false, message: `${name} not yet implemented.` });

/* ── parent + staff read ─────────────────────────────────────────────── */

/** GET /api/results/student/:studentId  → all results for a student */
exports.getStudentResults = check.getResultSheet;

/** GET /api/results/report-card/:studentId */
exports.getReportCard = check.getReportCard;

/** GET /api/results/remarks/:studentId */
exports.getRemarks = (req, res) => {
  // reportCardController.getOne returns the full card incl. remarks;
  // reuse it until a dedicated remarks-only endpoint is built.
  return card.getOne(req, res);
};

/* ── staff-only ──────────────────────────────────────────────────────── */

/** GET /api/results/class */
exports.getClassResults = card.classSummary;

/** GET /api/results/class-summary */
exports.getClassSummary = card.classSummary;

/** GET /api/results/export */
exports.exportResults = stub('exportResults');

/** POST /api/results  (upsert single) */
exports.upsert = stub('upsert');

/** POST /api/results/bulk */
exports.bulkUpsert = stub('bulkUpsert');

/** POST /api/results/remarks */
exports.saveRemarks = card.saveRemark;

/** GET  /api/results/domains/:studentId */
exports.getDomains = card.getDomains;

/** POST /api/results/domains */
exports.saveDomains = card.setDomains;

/** GET /api/results/:id */
exports.getOne = card.getOne;

/** PUT /api/results/:id */
exports.update = stub('update');

/** DELETE /api/results/:id */
exports.remove = stub('remove');