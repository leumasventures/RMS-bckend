'use strict';

const check = require('./checkResultController');
const card  = require('./reportCardController');
const db    = require('../config/db');

const stub = (name) => (_req, res) =>
  res.status(501).json({ ok: false, message: `${name} not yet implemented.` });

exports.getStudentResults = check.getResultSheet;
exports.getReportCard     = check.getReportCard;
exports.getRemarks        = (req, res) => card.getOne(req, res);
exports.getClassResults   = card.classSummary;
exports.getClassSummary   = card.classSummary;
exports.exportResults     = stub('exportResults');
exports.saveRemarks       = card.saveRemark;
exports.getDomains        = card.getDomains;
exports.saveDomains       = card.setDomains;
exports.getOne            = card.getOne;
exports.update            = stub('update');
exports.remove            = stub('remove');

/**
 * POST /api/results  — upsert a single result
 * Body: { studentId, subject, class, arm, term, session, ca, exam, total }
 */
exports.upsert = async (req, res) => {
  try {
    const record = await db.upsertResult(req.body);
    res.status(200).json({ ok: true, data: record });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
};

/**
 * POST /api/results/bulk  — upsert many results at once
 * Body: { results: [...], term?, session? }
 *   Each item: { studentId, subject, class, arm, ca, exam, total }
 *   term/session can be top-level defaults or per-item.
 */
exports.bulkUpsert = async (req, res) => {
  try {
    const { results, term: defTerm, session: defSession } = req.body;

    if (!Array.isArray(results) || !results.length)
      return res.status(400).json({ ok: false, message: 'results array is required.' });

    const saved = [];
    const errors = [];

    for (const item of results) {
      try {
        // Accept both camelCase (studentId) and snake_case (student_id)
        const studentId = item.studentId || item.student_id;
        if (!studentId) { errors.push({ item, error: 'missing studentId' }); continue; }

        const maxCA   = db.getMaxCA();
        const maxExam = db.getMaxExam();
        const caVal   = Math.min(maxCA,   Math.max(0, parseFloat(item.ca)   || 0));
        const examVal = Math.min(maxExam, Math.max(0, parseFloat(item.exam) || 0));
        if (caVal + examVal > 100) {
          errors.push({ item, error: `Total score ${caVal + examVal} exceeds 100` }); continue;
        }

        const record = await db.upsertResult({
          studentId,
          subject:   item.subject,
          class:     item.class,
          arm:       item.arm,
          term:      item.term    || defTerm,
          session:   item.session || defSession,
          ca:        caVal,
          exam:      examVal,
          total:     caVal + examVal,
        });
        saved.push(record);
      } catch (e) {
        errors.push({ item, error: e.message });
      }
    }

    res.status(200).json({
      ok: true,
      saved: saved.length,
      errors: errors.length ? errors : undefined,
      data: saved,
    });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
};