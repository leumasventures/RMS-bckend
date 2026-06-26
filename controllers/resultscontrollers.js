'use strict';

const check = require('./checkResultController');
const card = require('./reportCardController');
const db = require('../config/db');

const stub = (name) => (_req, res) => res.status(501).json({ ok: false, message: `${name} not yet implemented.` });

exports.getStudentResults = check.getResultSheet;
exports.getReportCard = check.getReportCard;
exports.getRemarks = (req, res) => card.getOne(req, res);
exports.getClassResults = card.classSummary;
exports.getClassSummary = card.classSummary;
exports.exportResults = stub('exportResults');
exports.saveRemarks = card.saveRemark;
exports.getDomains = card.getDomains;
exports.saveDomains = card.setDomains;
exports.getOne = card.getOne;
exports.update = stub('update');
exports.remove = stub('remove');

/**
 * POST /api/results — upsert a single result
 * Body: { studentId, student_id, subject, class, arm, term, session, ca, exam }
 */
exports.upsert = async (req, res) => {
  try {
    const data = req.body;
    // Map either studentId or student_id
    const studentId = data.studentId || data.student_id;
    
    if (!studentId || !data.subject || !data.class) {
      return res.status(400).json({ ok: false, message: 'Missing required fields (studentId, subject, class)' });
    }

    // Parse scores safely, fallback to 0 if not provided
    const caVal = data.ca !== undefined ? parseFloat(data.ca) : 0;
    const examVal = data.exam !== undefined ? parseFloat(data.exam) : 0;
    const totalVal = data.total !== undefined ? parseFloat(data.total) : (caVal + examVal);

    // Make sure db.upsertResult is an asynchronous function and is awaited
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
 * Body: { results: [...], term?, session? }
 */
exports.bulkUpsert = async (req, res) => {
  try {
    const { results, term: defTerm, session: defSession } = req.body;

    if (!Array.isArray(results) || !results.length) {
      return res.status(400).json({ ok: false, message: 'results array is required.' });
    }

    console.log(`[bulkUpsert] received ${results.length} items.`);

    const saved = [];
    const errors = [];

    // Fallback constants if db.getMaxCA or db.getMaxExam do not exist/fail
    const maxCA = typeof db.getMaxCA === 'function' ? db.getMaxCA() : 40;
    const maxExam = typeof db.getMaxExam === 'function' ? db.getMaxExam() : 60;

    for (const item of results) {
      try {
        const studentId = item.studentId || item.student_id;
        if (!studentId) {
          errors.push({ item, error: 'missing studentId or student_id' });
          continue;
        }

        // Parse and clamp CA score safely
        let caVal = item.ca !== undefined ? parseFloat(item.ca) : 0;
        if (isNaN(caVal)) caVal = 0;
        caVal = Math.min(maxCA, Math.max(0, caVal));

        // Parse and clamp Exam score safely
        let examVal = item.exam !== undefined ? parseFloat(item.exam) : 0;
        if (isNaN(examVal)) examVal = 0;
        examVal = Math.min(maxExam, Math.max(0, examVal));

        // Calculate total score safely
        const totalVal = item.total !== undefined ? parseFloat(item.total) : (caVal + examVal);

        // Await the asynchronous database call
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
        console.error(`[bulkUpsert] ITEM FAILED — studentId: ${item.studentId || item.student_id}, error:`, e.message);
        errors.push({ item, error: e.message });
      }
    }

    console.log(`[bulkUpsert] done: saved=${saved.length} errors=${errors.length}`);

    return res.status(200).json({
      ok: true,
      saved: saved.length,
      skipped: errors.length,
      errors: errors.length ? errors : undefined,
      data: saved,
    });

  } catch (e) {
    console.error('[bulkUpsert] OUTER ERROR:', e.message, e.stack);
    return res.status(500).json({ ok: false, message: e.message });
  }
};
