'use strict';

const check = require('./checkResultController');
const card = require('./reportCardController');
const db = require('../config/db');

const stub = (name) => (_req, res) => res.status(501).json({ ok: false, message: `${name} not yet implemented.` });

// Core Exports
exports.getStudentResults = check.getResultSheet;
exports.getReportCard = check.getReportCard;
exports.getClassResults = card.classSummary;
exports.getClassSummary = card.classSummary;
exports.exportResults = stub('exportResults');
exports.saveRemarks = card.saveRemark;
exports.getDomains = card.getDomains;
exports.saveDomains = card.setDomains;

// FIX: Ensure getRemarks is safely exported and falls back to getOne if needed
exports.getRemarks = typeof card.getOne === 'function' ? (req, res) => card.getOne(req, res) : stub('getRemarks');
exports.getOne = typeof card.getOne === 'function' ? card.getOne : stub('getOne');

exports.update = stub('update');
exports.remove = stub('remove');

/**
 * POST /api/results — upsert a single result
 */
exports.upsert = async (req, res) => {
  try {
    const data = req.body;
    const studentId = data.studentId || data.student_id;
    
    if (!studentId || !data.subject || !data.class) {
      return res.status(400).json({ ok: false, message: 'Missing required fields (studentId, subject, class)' });
    }

    const caVal = data.ca !== undefined ? parseFloat(data.ca) : 0;
    const examVal = data.exam !== undefined ? parseFloat(data.exam) : 0;
    const totalVal = data.total !== undefined ? parseFloat(data.total) : (caVal + examVal);

    const record = await db.upsertResult({
      studentId,
      subject: data.subject,
      class: data.class,
      arm: data.arm,
      term: data.term,
      session: data.session,
      ca: caVal,
      exam: examVal,
      total: totalVal
    });

    return res.status(200).json({ ok: true, data: record });
  } catch (e) {
    console.error('[upsert] Error inserting record:', e.message);
    return res.status(500).json({ ok: false, message: e.message });
  }
};

/**
 * POST /api/results/bulk — upsert many results at once
 */
exports.bulkUpsert = async (req, res) => {
  try {
    const { results, term: defTerm, session: defSession } = req.body;

    if (!Array.isArray(results) || !results.length) {
      return res.status(400).json({ ok: false, message: 'results array is required.' });
    }

    const saved = [];
    const errors = [];

    const maxCA = typeof db.getMaxCA === 'function' ? db.getMaxCA() : 40;
    const maxExam = typeof db.getMaxExam === 'function' ? db.getMaxExam() : 60;

    for (const item of results) {
      try {
        const studentId = item.studentId || item.student_id;
        if (!studentId) {
          errors.push({ item, error: 'missing studentId or student_id' });
          continue;
        }

        let caVal = item.ca !== undefined ? parseFloat(item.ca) : 0;
        if (isNaN(caVal)) caVal = 0;
        caVal = Math.min(maxCA, Math.max(0, caVal));

        let examVal = item.exam !== undefined ? parseFloat(item.exam) : 0;
        if (isNaN(examVal)) examVal = 0;
        examVal = Math.min(maxExam, Math.max(0, examVal));

        const totalVal = item.total !== undefined ? parseFloat(item.total) : (caVal + examVal);

        const record = await db.upsertResult({
          studentId,
          subject: item.subject,
          class: item.class || item.className, 
          arm: item.arm,
          term: item.term || defTerm,
          session: item.session || defSession,
          ca: caVal,
          exam: examVal,
          total: totalVal,
        });

        saved.push(record);
      } catch (e) {
        errors.push({ item, error: e.message });
      }
    }

    return res.status(200).json({
      ok: true,
      saved: saved.length,
      skipped: errors.length,
      errors: errors.length ? errors : undefined,
      data: saved,
    });
  } catch (e) {
    return res.status(500).json({ ok: false, message: e.message });
  }
};
