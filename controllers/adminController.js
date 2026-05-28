'use strict';
const db = require('../config/db');
const fail = (res, s, m) => res.status(s).json({ success: false, message: m });
const ok   = (res, data, meta = {}, s = 200) => res.status(s).json({ success: true, ...meta, data });

/* GET /api/admin  — returns all settings as flat key-value map */
exports.getSettings = async (req, res) => {
  try {
    const settings = await db.getSettings();

    // Parse and attach structured objects so the frontend doesn't have to
    // parse JSON strings itself — both raw flat keys AND parsed structures returned
    let gradingScale  = null;
    let scoreBreakdown = null;
    let domainLabels  = null;

    try { if (settings.grading_scale)  gradingScale   = JSON.parse(settings.grading_scale);  } catch(e) {}
    try { if (settings.score_breakdown) scoreBreakdown = JSON.parse(settings.score_breakdown); } catch(e) {}
    try { if (settings.domain_labels)  domainLabels   = JSON.parse(settings.domain_labels);   } catch(e) {}

    let promotionSettings = null;
    try { if (settings.promotion_settings) promotionSettings = JSON.parse(settings.promotion_settings); } catch(e) {}

    return ok(res, {
      ...settings,
      _gradingScale:       gradingScale       || db.getGradingScale(),
      _scoreBreakdown:     scoreBreakdown     || db.getScoreBreakdown(),
      _domainLabels:       domainLabels       || {},
      _promotionSettings:  promotionSettings  || db.getPromotionSettings(),
      _passMark:           db.getPassMark(),
      _maxCA:              db.getMaxCA(),
      _maxExam:            db.getMaxExam(),
    });
  } catch (e) { return fail(res, 500, e.message); }
};

/* POST /api/admin  — update settings key-value pairs */
exports.updateSettings = async (req, res) => {
  try {
    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body))
      return fail(res, 400, 'Request body must be a key-value object.');

    // Handle special clear flags
    if (body.clear_results === '1') {
      await db.run('DELETE FROM results');
      await db.run('DELETE FROM report_card_remarks');
      db.results = [];
      db.remarks = [];
    }
    if (body.clear_attendance === '1') {
      await db.run('DELETE FROM attendance');
      await db.run('DELETE FROM domain_assessments');
      await db.run('UPDATE students SET attendance=100');
      db.attendance = [];
      db.domainAssessments = [];
    }

    const filtered = Object.fromEntries(
      Object.entries(body).filter(([k]) => !['clear_results','clear_attendance'].includes(k))
    );

    if (Object.keys(filtered).length > 0) {
      await db.updateSettings(filtered);
    }

    return ok(res, { updated: Object.keys(body).length });
  } catch (e) { return fail(res, 500, e.message); }
};