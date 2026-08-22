const express = require('express');
const { db } = require('../db');
const router = express.Router();

router.get('/', (req, res) => {
  const comp = Number(req.query.compania);
  if (!comp) return res.status(400).json({ error: 'Debe especificar el parámetro compania.' });
  const bancos = db.prepare('SELECT * FROM bancos_cuentas WHERE id_compania = ? ORDER BY nombre ASC').all(comp);
  res.json(bancos);
});

router.post('/', (req, res) => {
  const { id_compania, codigo, nombre, numero_cuenta, saldo_actual, id_cuenta_contable } = req.body || {};
  if (!id_compania || !codigo || !nombre) {
    return res.status(400).json({ error: 'Compañía, código y nombre son requeridos.' });
  }

  try {
    const r = db.prepare(`
      INSERT INTO bancos_cuentas (id_compania, codigo, nombre, numero_cuenta, saldo_actual, id_cuenta_contable)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      id_compania,
      codigo.trim().toUpperCase(),
      nombre.trim(),
      numero_cuenta || null,
      Number(saldo_actual) || 0,
      id_cuenta_contable || '11001001'
    );
    res.status(201).json({ id_banco: r.lastInsertRowid });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
