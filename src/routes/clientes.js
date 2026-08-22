const express = require('express');
const { db } = require('../db');
const router = express.Router();

// Listar clientes de una compañía
router.get('/', (req, res) => {
  const comp = Number(req.query.compania);
  if (!comp) return res.status(400).json({ error: 'Debe especificar el parámetro compania.' });
  const clientes = db.prepare('SELECT * FROM clientes WHERE id_compania = ? ORDER BY nombre ASC').all(comp);
  res.json(clientes);
});

// Obtener cliente por ID
router.get('/:id', (req, res) => {
  const cliente = db.prepare('SELECT * FROM clientes WHERE id_cliente = ?').get(req.params.id);
  if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado.' });
  res.json(cliente);
});

// Crear cliente
router.post('/', (req, res) => {
  const { id_compania, codigo, nombre, cedula_rnc, telefono, email, direccion, limite_credito, dias_credito } = req.body || {};
  if (!id_compania || !nombre || !codigo) {
    return res.status(400).json({ error: 'Compañía, código y nombre son obligatorios.' });
  }

  try {
    const r = db.prepare(`
      INSERT INTO clientes (id_compania, codigo, nombre, cedula_rnc, telefono, email, direccion, limite_credito, dias_credito, saldo_actual)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
    `).run(
      id_compania,
      codigo.trim().toUpperCase(),
      nombre.trim(),
      cedula_rnc || null,
      telefono || null,
      email || null,
      direccion || null,
      Number(limite_credito) || 0,
      Number(dias_credito) || 30
    );
    res.status(201).json({ id_cliente: r.lastInsertRowid });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Estado de cuenta del cliente
router.get('/:id/estado-cuenta', (req, res) => {
  const idCliente = Number(req.params.id);
  const cliente = db.prepare('SELECT * FROM clientes WHERE id_cliente = ?').get(idCliente);
  if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado.' });

  const facturasPendientes = db.prepare(`
    SELECT c.*, f.numero_factura, f.tipo_pago
    FROM cuentas_cobrar c
    JOIN facturas f ON f.id_factura = c.id_factura
    WHERE c.id_cliente = ? AND c.estado != 'PAGADA'
    ORDER BY c.fecha ASC
  `).all(idCliente);

  res.json({ cliente, facturasPendientes });
});

module.exports = router;
