const express = require('express');
const { db } = require('../db');
const router = express.Router();

// GET /api/tipos-documento - Listar todos los tipos de documento
router.get('/', (req, res) => {
  const activo = req.query.activo;
  const categoria = req.query.categoria;

  let query = 'SELECT * FROM tipos_documento WHERE 1=1';
  const params = [];

  if (activo !== undefined) {
    query += ' AND activo = ?';
    params.push(Number(activo));
  }
  if (categoria) {
    query += ' AND categoria = ?';
    params.push(categoria.toUpperCase());
  }

  query += ` ORDER BY 
    CASE categoria 
      WHEN 'MANUAL' THEN 1 
      WHEN 'BANCOS' THEN 2 
      WHEN 'AUTOMATICO' THEN 3 
      ELSE 4 
    END, CAST(codigo AS INTEGER), codigo`;

  const tipos = db.prepare(query).all(...params);
  res.json(tipos);
});

// POST /api/tipos-documento - Crear un nuevo tipo de documento
router.post('/', (req, res) => {
  const { codigo, nombre, categoria, alimenta_conciliacion, activo } = req.body || {};

  if (!codigo || !nombre || !categoria) {
    return res.status(400).json({ error: 'Debe indicar código, nombre y categoría del tipo de documento.' });
  }

  const cod = String(codigo).padStart(2, '0').trim();
  const cat = String(categoria).toUpperCase().trim();

  if (!['MANUAL', 'BANCOS', 'AUTOMATICO'].includes(cat)) {
    return res.status(400).json({ error: 'Categoría inválida. Debe ser MANUAL, BANCOS o AUTOMATICO.' });
  }

  const dup = db.prepare('SELECT codigo FROM tipos_documento WHERE codigo = ?').get(cod);
  if (dup) {
    return res.status(400).json({ error: `El tipo de documento con código [${cod}] ya existe.` });
  }

  try {
    db.prepare(`
      INSERT INTO tipos_documento (codigo, nombre, categoria, alimenta_conciliacion, activo)
      VALUES (?, ?, ?, ?, ?)
    `).run(cod, nombre.trim(), cat, alimenta_conciliacion ? 1 : 0, activo !== undefined ? (activo ? 1 : 0) : 1);

    res.status(201).json({ ok: true, codigo: cod });
  } catch (err) {
    res.status(500).json({ error: 'Error al registrar tipo de documento: ' + err.message });
  }
});

// PUT /api/tipos-documento/:codigo - Actualizar tipo de documento
router.put('/:codigo', (req, res) => {
  const cod = req.params.codigo;
  const { nombre, categoria, alimenta_conciliacion, activo } = req.body || {};

  const existe = db.prepare('SELECT * FROM tipos_documento WHERE codigo = ?').get(cod);
  if (!existe) {
    return res.status(404).json({ error: `Tipo de documento [${cod}] no encontrado.` });
  }

  const nuevoNombre = (nombre !== undefined ? nombre : existe.nombre).trim();
  const nuevaCat = (categoria !== undefined ? String(categoria).toUpperCase() : existe.categoria).trim();
  const nuevaConcil = alimenta_conciliacion !== undefined ? (alimenta_conciliacion ? 1 : 0) : existe.alimenta_conciliacion;
  const nuevoActivo = activo !== undefined ? (activo ? 1 : 0) : existe.activo;

  if (!['MANUAL', 'BANCOS', 'AUTOMATICO'].includes(nuevaCat)) {
    return res.status(400).json({ error: 'Categoría inválida.' });
  }

  try {
    db.prepare(`
      UPDATE tipos_documento
      SET nombre = ?, categoria = ?, alimenta_conciliacion = ?, activo = ?
      WHERE codigo = ?
    `).run(nuevoNombre, nuevaCat, nuevaConcil, nuevoActivo, cod);

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Error al actualizar tipo de documento: ' + err.message });
  }
});

module.exports = router;
