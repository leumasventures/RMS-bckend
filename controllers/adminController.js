'use strict';
const db = require('../config/db');
const fail = (res, s, m) => res.status(s).json({ success: false, message: m });
const ok   = (res, data, meta = {}, s = 200) => res.status(s).json({ success: true, ...meta, data });

/* GET /api/admin/settings */
exports.getSettings = async (req, res) => {
  try {
    const settings = await db.getSettings();
    return ok(res, settings);
  } catch (e) { return fail(res, 500, e.message); }
};

/* POST /api/admin/settings  body: { key: value, ... } */
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

    // Filter out the clear flags before persisting
    const filtered = Object.fromEntries(
      Object.entries(body).filter(([k]) => !['clear_results','clear_attendance'].includes(k))
    );

    if (Object.keys(filtered).length > 0) {
      await db.updateSettings(filtered);
    }

    return ok(res, { updated: Object.keys(body).length });
  } catch (e) { return fail(res, 500, e.message); }
};