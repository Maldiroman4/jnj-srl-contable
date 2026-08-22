const express = require('express');
const { db } = require('../db');
const router = express.Router();

router.get('/', (req, res) => {
  res.json(db.prepare('SELECT * FROM companias ORDER BY id_compania').all());
});

router.post('/', (req, res) => {
  const { razon_social, cedula_juridica, mes_activo, ano_activo } = req.body || {};
  if (!razon_social) return res.status(400).json({ error: 'Debe indicar la razón social.' });
  const r = db.prepare(
    'INSERT INTO companias (razon_social, cedula_juridica, mes_activo, ano_activo) VALUES (?, ?, ?, ?)'
  ).run(razon_social, cedula_juridica || null, mes_activo || 1, ano_activo || new Date().getFullYear());
  res.status(201).json({ id_compania: r.lastInsertRowid });
});

router.post('/:id/activar', (req, res) => {
  const id = Number(req.params.id);
  const { mes_activo, ano_activo } = req.body || {};
  db.prepare('UPDATE companias SET mes_activo = ?, ano_activo = ? WHERE id_compania = ?')
    .run(mes_activo || 1, ano_activo || new Date().getFullYear(), id);
  res.json({ ok: true });
});

module.exports = router;