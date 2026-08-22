const express = require('express');
const { db, tx } = require('../db');
const router = express.Router();

router.get('/', (req, res) => {
  const comp = Number(req.query.compania);
  if (!comp) return res.status(400).json({ error: 'Debe especificar el parámetro compania.' });

  const cxp = db.prepare(`
    SELECT c.*, p.nombre as proveedor_nombre, p.rnc, p.telefono
    FROM cuentas_pagar c
    JOIN proveedores p ON p.id_proveedor = c.id_proveedor
    WHERE c.id_compania = ?
    ORDER BY c.fecha_vencimiento ASC
  `).all(comp);

  res.json(cxp);
});

router.post('/compra', (req, res) => {
  const { id_compania, id_proveedor, documento_ref, fecha, fecha_vencimiento, monto_total } = req.body || {};
  if (!id_compania || !id_proveedor || !documento_ref || !monto_total) {
    return res.status(400).json({ error: 'Compañía, proveedor, referencia y monto son requeridos.' });
  }

  try {
    tx(() => {
      const monto = Number(monto_total);
      db.prepare(`
        INSERT INTO cuentas_pagar (id_compania, id_proveedor, documento_ref, fecha, fecha_vencimiento, monto_total, monto_pagado, saldo, estado)
        VALUES (?, ?, ?, ?, ?, ?, 0, ?, 'PENDIENTE')
      `).run(
        id_compania,
        id_proveedor,
        documento_ref,
        fecha || new Date().toISOString().split('T')[0],
        fecha_vencimiento || new Date().toISOString().split('T')[0],
        monto,
        monto
      );

      db.prepare('UPDATE proveedores SET saldo_actual = saldo_actual + ? WHERE id_proveedor = ?')
        .run(monto, id_proveedor);
    });

    res.status(201).json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
