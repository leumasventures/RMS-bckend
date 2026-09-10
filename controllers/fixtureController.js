'use strict';

/**
 * fixtureController.js — Sacred Heart College (SAHARCO)
 * ALL writes go to MySQL via db.run / db.query.
 */

const db = require('../config/db');

const VALID_STATUSES = ['Upcoming', 'Live', 'Completed', 'Postponed', 'Cancelled'];
const VALID_TYPES    = ['Football', 'Basketball', 'Athletics', 'Debate', 'Quiz', 'Other'];

const fail = (res, status, msg, extra = {}) =>
  res.status(status).json({ success: false, message: msg, ...extra });

const ok = (res, data, meta = {}, status = 200) =>
  res.status(status).json({ success: true, ...meta, data });

/* ── ensure table exists at boot ─────────────────────────────────────────── */
(async () => {
  try {
    await db.run(`
      CREATE TABLE IF NOT EXISTS fixtures (
        id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        type       VARCHAR(50)  NOT NULL DEFAULT 'Football',
        team_a     VARCHAR(100) NOT NULL,
        team_b     VARCHAR(100) NOT NULL,
        date       DATE         NULL,
        time       VARCHAR(20)  NULL,
        venue      VARCHAR(200) NULL,
        status     VARCHAR(30)  NOT NULL DEFAULT 'Upcoming',
        score_a    TINYINT UNSIGNED NULL,
        score_b    TINYINT UNSIGNED NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
    console.info('[fixtures] table ready.');
  } catch (err) {
    console.error('[fixtures] table init error:', err.message);
  }
})();

/* ── row mapper ──────────────────────────────────────────────────────────── */
function mapRow(r) {
  return {
    id:     r.id,
    type:   r.type,
    teamA:  r.team_a,
    teamB:  r.team_b,
    date:   r.date ? String(r.date).split('T')[0] : '',
    time:   r.time   || '',
    venue:  r.venue  || '',
    status: r.status,
    scoreA: r.score_a ?? null,
    scoreB: r.score_b ?? null,
  };
}

/* ── GET /api/fixtures ───────────────────────────────────────────────────── */
exports.getAll = async (req, res) => {
  try {
    const { type, status, from, to } = req.query;
    let sql = 'SELECT * FROM fixtures WHERE 1=1';
    const params = [];
    if (type)   { sql += ' AND type=?';   params.push(type); }
    if (status) { sql += ' AND status=?'; params.push(status); }
    if (from)   { sql += ' AND date>=?';  params.push(from); }
    if (to)     { sql += ' AND date<=?';  params.push(to); }
    sql += ' ORDER BY date DESC, time ASC';
    const rows = await db.query(sql, params);
    return ok(res, rows.map(mapRow), { count: rows.length });
  } catch (e) {
    // Any DB error (table missing, connection issue) → return empty list, never 500
    console.warn('[fixtures] getAll (non-fatal):', e.message);
    return ok(res, [], { count: 0 });
  }
};

/* ── GET /api/fixtures/:id ───────────────────────────────────────────────── */
exports.getOne = async (req, res) => {
  try {
    const row = await db.query1(
      'SELECT * FROM fixtures WHERE id = ?', [req.params.id]
    );
    if (!row) return fail(res, 404, 'Fixture not found.');
    return ok(res, mapRow(row));
  } catch (e) {
    console.error('[fixtures] getOne:', e.message);
    return fail(res, 500, e.message);
  }
};

/* ── POST /api/fixtures ──────────────────────────────────────────────────── */
exports.create = async (req, res) => {
  try {
    const {
      type = 'Football', teamA, teamB,
      date, time, venue, status = 'Upcoming',
    } = req.body ?? {};

    if (!teamA) return fail(res, 400, 'teamA is required.');
    if (!teamB) return fail(res, 400, 'teamB is required.');
    if (!VALID_TYPES.includes(type))
      return fail(res, 400, `type must be one of: ${VALID_TYPES.join(', ')}.`);
    if (!VALID_STATUSES.includes(status))
      return fail(res, 400, `status must be one of: ${VALID_STATUSES.join(', ')}.`);

    const result = await db.run(
      `INSERT INTO fixtures (type, team_a, team_b, date, time, venue, status)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [type, teamA, teamB, date || null, time || null, venue || null, status]
    );

    return ok(res, {
      id: result.insertId,
      type, teamA, teamB,
      date: date || '',
      time: time || '',
      venue: venue || '',
      status,
      scoreA: null,
      scoreB: null,
    }, {}, 201);
  } catch (e) {
    console.error('[fixtures] create:', e.message);
    return fail(res, 500, e.message);
  }
};

/* ── PUT /api/fixtures/:id ───────────────────────────────────────────────── */
exports.update = async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await db.query1('SELECT * FROM fixtures WHERE id = ?', [id]);
    if (!existing) return fail(res, 404, 'Fixture not found.');

    const {
      type   = existing.type,
      teamA  = existing.team_a,
      teamB  = existing.team_b,
      date   = existing.date,
      time   = existing.time,
      venue  = existing.venue,
      status = existing.status,
      scoreA = existing.score_a,
      scoreB = existing.score_b,
    } = req.body ?? {};

    if (!VALID_TYPES.includes(type))
      return fail(res, 400, `type must be one of: ${VALID_TYPES.join(', ')}.`);
    if (!VALID_STATUSES.includes(status))
      return fail(res, 400, `status must be one of: ${VALID_STATUSES.join(', ')}.`);

    await db.run(
      `UPDATE fixtures
       SET type=?, team_a=?, team_b=?, date=?, time=?, venue=?, status=?, score_a=?, score_b=?
       WHERE id=?`,
      [type, teamA, teamB, date || null, time || null, venue || null,
       status, scoreA ?? null, scoreB ?? null, id]
    );

    return ok(res, {
      id: Number(id), type, teamA, teamB,
      date: date ? String(date).split('T')[0] : '',
      time: time   || '',
      venue: venue || '',
      status,
      scoreA: scoreA ?? null,
      scoreB: scoreB ?? null,
    });
  } catch (e) {
    console.error('[fixtures] update:', e.message);
    return fail(res, 500, e.message);
  }
};

/* ── PATCH /api/fixtures/:id/score ──────────────────────────────────────── */
exports.updateScore = async (req, res) => {
  try {
    const { id } = req.params;
    const { scoreA, scoreB, status } = req.body ?? {};

    const existing = await db.query1('SELECT * FROM fixtures WHERE id = ?', [id]);
    if (!existing) return fail(res, 404, 'Fixture not found.');

    if (scoreA == null || scoreB == null)
      return fail(res, 400, 'scoreA and scoreB are required.');

    const newStatus = status ?? (existing.status === 'Upcoming' ? 'Live' : existing.status);
    if (!VALID_STATUSES.includes(newStatus))
      return fail(res, 400, `status must be one of: ${VALID_STATUSES.join(', ')}.`);

    await db.run(
      'UPDATE fixtures SET score_a=?, score_b=?, status=? WHERE id=?',
      [scoreA, scoreB, newStatus, id]
    );

    return ok(res, {
      id: Number(id),
      scoreA: Number(scoreA),
      scoreB: Number(scoreB),
      status: newStatus,
    });
  } catch (e) {
    console.error('[fixtures] updateScore:', e.message);
    return fail(res, 500, e.message);
  }
};

/* ── PATCH /api/fixtures/:id/status ─────────────────────────────────────── */
exports.setStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body ?? {};

    if (!VALID_STATUSES.includes(status))
      return fail(res, 400, `status must be one of: ${VALID_STATUSES.join(', ')}.`);

    const existing = await db.query1('SELECT id FROM fixtures WHERE id = ?', [id]);
    if (!existing) return fail(res, 404, 'Fixture not found.');

    await db.run('UPDATE fixtures SET status=? WHERE id=?', [status, id]);
    return ok(res, { id: Number(id), status });
  } catch (e) {
    console.error('[fixtures] setStatus:', e.message);
    return fail(res, 500, e.message);
  }
};

/* ── DELETE /api/fixtures/:id ────────────────────────────────────────────── */
exports.remove = async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await db.query1('SELECT id FROM fixtures WHERE id = ?', [id]);
    if (!existing) return fail(res, 404, 'Fixture not found.');

    await db.run('DELETE FROM fixtures WHERE id=?', [id]);
    return ok(res, { id: Number(id), deleted: true });
  } catch (e) {
    console.error('[fixtures] remove:', e.message);
    return fail(res, 500, e.message);
  }
};