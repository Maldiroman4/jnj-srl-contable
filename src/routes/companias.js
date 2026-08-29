const express = require('express');
const { db } = require('../db');
const router = express.Router();

router.get('/', (req, res) => {
  res.json(db.prepare('SELECT * FROM companias ORDER BY id_compania').all());
});

router.post('/', (req, res) => {
  const { id_compania, razon_social, cedula_juridica, mes_inicio, anio_inicio, mes_activo, ano_activo } = req.body || {};
  if (!razon_social) {
    return res.status(400).json({ error: 'Debe indicar la razón social de la compañía.' });
  }

  const mInicio = Number(mes_inicio);
  const aInicio = Number(anio_inicio);

  if (!mInicio || isNaN(mInicio) || mInicio < 1 || mInicio > 12) {
    return res.status(400).json({ error: 'Debe indicar un mes de inicio contable válido (1 a 12).' });
  }
  if (!aInicio || isNaN(aInicio) || aInicio < 1900 || aInicio > 2100) {
    return res.status(400).json({ error: 'Debe indicar un año de inicio contable válido (ej. 2026).' });
  }

  const mActivo = mes_activo ? Number(mes_activo) : mInicio;
  const aActivo = ano_activo ? Number(ano_activo) : aInicio;

  if (id_compania) {
    const existe = db.prepare('SELECT id_compania FROM companias WHERE id_compania = ?').get(Number(id_compania));
    if (existe) {
      return res.status(400).json({ error: `La compañía con código ${id_compania} ya existe en el sistema.` });
    }
    const r = db.prepare(
      `INSERT INTO companias (id_compania, razon_social, cedula_juridica, mes_inicio, anio_inicio, mes_activo, ano_activo)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(Number(id_compania), razon_social, cedula_juridica || null, mInicio, aInicio, mActivo, aActivo);
    return res.status(201).json({ id_compania: Number(id_compania), ok: true });
  }

  const r = db.prepare(
    `INSERT INTO companias (razon_social, cedula_juridica, mes_inicio, anio_inicio, mes_activo, ano_activo)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(razon_social, cedula_juridica || null, mInicio, aInicio, mActivo, aActivo);

  res.status(201).json({ id_compania: r.lastInsertRowid, ok: true });
});

router.post('/:id/activar', (req, res) => {
  const id = Number(req.params.id);
  const { mes_activo, ano_activo } = req.body || {};
  db.prepare('UPDATE companias SET mes_activo = ?, ano_activo = ? WHERE id_compania = ?')
    .run(mes_activo || 1, ano_activo || new Date().getFullYear(), id);
  res.json({ ok: true });
});

module.exports = router;