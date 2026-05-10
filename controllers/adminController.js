'use strict';

/**
 * adminController.js — Sacred Heart College (SAHARCO)
 *
 * Routes (wired in adminRoutes.js):
 *   GET  /api/admin/settings    getSettings
 *   POST /api/admin/settings    updateSettings
 *
 * api-bridge.js calls API.Admin.updateSettings() and API.Admin.getSettings()
 * for ALL key-value data that doesn't have its own dedicated endpoint:
 *   grading_scale, domain_labels, score_breakdown, timetable,
 *   fixtures, parent_tokens, att_specialDays, remarks, domain assessments,
 *   subject allocations, fee_records (fallback), clear_results, clear_attendance.
 *
 * This controller simply proxies those calls to db.updateSettings() /
 * db.getSettings() which persist to the school_settings MySQL table.
 *
 * Side-effects handled here:
 *   clear_results=1  → DELETE FROM results
 *   clear_attendance=1 → DELETE FROM attendance + domain_assessments
 */

const db = require('../config/db');

/* ─── GET /api/admin/settings ──────────────────────────────────── */
exports.getSettings = async (req, res) => {
  try {
    const settings = await db.getSettings();
    return res.json({ success: true, data: settings });
  } catch (err) {
    console.error('[adminController.getSettings]', err);
    return res.status(500).json({ success: false, message: 'Failed to load settings.' });
  }
};

/* ─── POST /api/admin/settings ─────────────────────────────────── */
exports.updateSettings = async (req, res) => {
  const body = req.body;
  if (!body || typeof body !== 'object' || Array.isArray(body))
    return res.status(400).json({ success: false, message: 'Body must be a JSON object of key-value pairs.' });

  try {
    // Handle special clear-data commands
    if (body.clear_results === '1') {
      await db.pool.query('DELETE FROM results');
      await db.pool.query('DELETE FROM report_card_remarks');
      db.results = [];
      db.remarks = [];
      delete body.clear_results;
    }

    if (body.clear_attendance === '1') {
      await db.pool.query('DELETE FROM attendance');
      await db.pool.query('DELETE FROM domain_assessments');
      db.attendance        = [];
      db.domainAssessments = [];
      // Reset student attendance %
      await db.pool.query('UPDATE students SET attendance = 100');
      db.students.forEach(s => { s.attendance = 100; });
      delete body.clear_attendance;
    }

    // Persist remaining keys
    if (Object.keys(body).length > 0) {
      await db.updateSettings(body);
    }

    return res.json({ success: true, message: 'Settings saved.' });
  } catch (err) {
    console.error('[adminController.updateSettings]', err);
    return res.status(500).json({ success: false, message: 'Failed to save settings: ' + err.message });
  }
};