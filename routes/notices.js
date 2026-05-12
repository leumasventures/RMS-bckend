'use strict';
const router = require('express').Router();
const pool   = require('../db');

router.get('/', async (req, res) => {
  const { audience } = req.query;
  try {
    let sql = 'SELECT * FROM notices WHERE 1=1';
    const args = [];
    if (audience) { sql += ' AND (audience=? OR audience="all")'; args.push(audience); }
    sql += ' ORDER BY pinned DESC, created_at DESC';
    const [rows] = await pool.query(sql, args);
    res.json(rows);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.post('/', async (req, res) => {
  const { title, body, audience = 'all', pinned = false } = req.body;
  if (!title) return res.status(400).json({ message: 'Title is required.' });
  try {
    const [r] = await pool.query(
      'INSERT INTO notices (title, body, audience, pinned) VALUES (?,?,?,?)',
      [title, body, audience, pinned ? 1 : 0]
    );
    res.status(201).json({ id: r.insertId, title, body, audience, pinned });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM notices WHERE id=?', [req.params.id]);
    res.status(204).end();
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;
