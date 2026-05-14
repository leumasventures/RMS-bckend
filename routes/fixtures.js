'use strict';
const router = require('express').Router();
const { pool } = require('../config/db');

function mapRow(r) {
  return {
    id: r.id, type: r.type, teamA: r.team_a, teamB: r.team_b,
    date: r.date ? r.date.toISOString().split('T')[0] : '',
    time: r.time, venue: r.venue, status: r.status,
    scoreA: r.score_a, scoreB: r.score_b,
  };
}

router.get('/', async (_req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM fixtures ORDER BY date DESC');
    res.json(rows.map(mapRow));
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.post('/', async (req, res) => {
  const { type, teamA, teamB, date, time, venue, status = 'Upcoming' } = req.body;
  try {
    const [r] = await pool.query(
      'INSERT INTO fixtures (type, team_a, team_b, date, time, venue, status) VALUES (?,?,?,?,?,?,?)',
      [type, teamA, teamB, date || null, time, venue, status]
    );
    res.status(201).json({ id: r.insertId, ...req.body });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.put('/:id', async (req, res) => {
  const { type, teamA, teamB, date, time, venue, status, scoreA, scoreB } = req.body;
  try {
    await pool.query(
      'UPDATE fixtures SET type=?,team_a=?,team_b=?,date=?,time=?,venue=?,status=?,score_a=?,score_b=? WHERE id=?',
      [type, teamA, teamB, date || null, time, venue, status, scoreA ?? null, scoreB ?? null, req.params.id]
    );
    res.json({ id: req.params.id, ...req.body });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM fixtures WHERE id=?', [req.params.id]);
    res.status(204).end();
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;
