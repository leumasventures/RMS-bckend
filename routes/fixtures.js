'use strict';
const router    = require('express').Router();
const sequelize = require('../config/db');
const { QueryTypes } = require('sequelize');

function mapRow(r) {
  return {
    id: r.id, type: r.type, teamA: r.team_a, teamB: r.team_b,
    date: r.date ? new Date(r.date).toISOString().split('T')[0] : '',
    time: r.time, venue: r.venue, status: r.status,
    scoreA: r.score_a, scoreB: r.score_b,
  };
}

router.get('/', async (_req, res) => {
  try {
    const rows = await sequelize.query(
      'SELECT * FROM fixtures ORDER BY date DESC',
      { type: QueryTypes.SELECT }
    );
    res.json(rows.map(mapRow));
  } catch (err) {
    console.error('[fixtures] GET /:', err);
    res.status(500).json({ message: err.message });
  }
});

router.post('/', async (req, res) => {
  const { type, teamA, teamB, date, time, venue, status = 'Upcoming' } = req.body;
  try {
    const [result] = await sequelize.query(
      'INSERT INTO fixtures (type, team_a, team_b, date, time, venue, status) VALUES (?,?,?,?,?,?,?)',
      { replacements: [type, teamA, teamB, date || null, time, venue, status], type: QueryTypes.INSERT }
    );
    res.status(201).json({ id: result, ...req.body });
  } catch (err) {
    console.error('[fixtures] POST /:', err);
    res.status(500).json({ message: err.message });
  }
});

router.put('/:id', async (req, res) => {
  const { type, teamA, teamB, date, time, venue, status, scoreA, scoreB } = req.body;
  try {
    await sequelize.query(
      'UPDATE fixtures SET type=?,team_a=?,team_b=?,date=?,time=?,venue=?,status=?,score_a=?,score_b=? WHERE id=?',
      { replacements: [type, teamA, teamB, date || null, time, venue, status, scoreA ?? null, scoreB ?? null, req.params.id], type: QueryTypes.UPDATE }
    );
    res.json({ id: req.params.id, ...req.body });
  } catch (err) {
    console.error('[fixtures] PUT /:id:', err);
    res.status(500).json({ message: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await sequelize.query(
      'DELETE FROM fixtures WHERE id=?',
      { replacements: [req.params.id], type: QueryTypes.DELETE }
    );
    res.status(204).end();
  } catch (err) {
    console.error('[fixtures] DELETE /:id:', err);
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;