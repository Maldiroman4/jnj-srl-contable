const express = require('express');
const { db } = require('../db');
const router = express.Router();

router.get('/', (req, res) => {
  const comp = Number(req.query.compania);
  if (!comp) return res.status(400).json({ error: 'Debe especificar el parámetro compania.' });
  const proveedores = db.prepare('SELECT * FROM proveedores WHERE id_compania = ? ORDER BY nombre ASC').all(comp);
  res.json(proveedores);
});

router.post('/', (req, res) => {
  const { id_compania, codigo, nombre, rnc, telefono, email, direccion } = req.body || {};
  if (!id_compania || !nombre || !codigo) {
    return res.status(400).json({ error: 'Compañía, código y nombre son obligatorios.' });
  }

  try {
    const r = db.prepare(`
      INSERT INTO proveedores (id_compania, codigo, nombre, rnc, telefono, email, direccion, saldo_actual)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0)
    `).run(
      id_compania,
      codigo.trim().toUpperCase(),
      nombre.trim(),
      rnc || null,
      telefono || null,
      email || null,
      direccion || null
    );
    res.status(201).json({ id_proveedor: r.lastInsertRowid });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
