const express = require('express');
const { db, tx } = require('../db');
const router = express.Router();

// Listar cartera por cobrar
router.get('/', (req, res) => {
  const comp = Number(req.query.compania);
  if (!comp) return res.status(400).json({ error: 'Debe especificar el parámetro compania.' });

  const cxc = db.prepare(`
    SELECT c.*, cl.nombre as cliente_nombre, cl.cedula_rnc, cl.telefono, f.numero_factura
    FROM cuentas_cobrar c
    JOIN clientes cl ON cl.id_cliente = c.id_cliente
    JOIN facturas f ON f.id_factura = c.id_factura
    WHERE c.id_compania = ?
    ORDER BY c.fecha_vencimiento ASC
  `).all(comp);

  res.json(cxc);
});

// Listar recibos de caja emitidos
router.get('/recibos', (req, res) => {
  const comp = Number(req.query.compania);
  if (!comp) return res.status(400).json({ error: 'Debe especificar el parámetro compania.' });

  const recibos = db.prepare(`
    SELECT r.*, cl.nombre as cliente_nombre, b.nombre as banco_nombre
    FROM recibos_caja r
    JOIN clientes cl ON cl.id_cliente = r.id_cliente
    JOIN bancos_cuentas b ON b.id_banco = r.id_banco
    WHERE r.id_compania = ?
    ORDER BY r.id_recibo DESC
  `).all(comp);

  res.json(recibos);
});

// Procesar Recibo de Caja (Abono a Factura con Asiento Contable Automático)
router.post('/recibo', (req, res) => {
  const {
    id_compania, id_cliente, id_banco, fecha, monto,
    referencia, concepto, aplicaciones // Array de { id_cxc, monto }
  } = req.body || {};

  if (!id_compania || !id_cliente || !monto || Number(monto) <= 0) {
    return res.status(400).json({ error: 'Compañía, cliente y monto válido son obligatorios.' });
  }

  try {
    const resultado = tx(() => {
      const cliente = db.prepare('SELECT * FROM clientes WHERE id_cliente = ?').get(id_cliente);
      if (!cliente) throw new Error('Cliente no encontrado.');

      const banco = db.prepare('SELECT * FROM bancos_cuentas WHERE id_banco = ?').get(id_banco || 1);
      const montoTotal = Number(monto);

      // 1. Correlativo de recibo
      const last = db.prepare('SELECT id_recibo FROM recibos_caja WHERE id_compania = ? ORDER BY id_recibo DESC LIMIT 1').get(id_compania);
      const nextNum = (last ? last.id_recibo + 1 : 1).toString().padStart(6, '0');
      const numRecibo = `RC-${nextNum}`;

      // 2. Asiento contable de Tesorería
      const numAsiento = `2026-R${nextNum}`;
      const rAsiento = db.prepare(`
        INSERT INTO documentos_asientos (
          id_compania, tipo_documento, numero_documento, fecha, detalle_general, total_debitos, total_creditos
        ) VALUES (?, 2, ?, ?, ?, ?, ?)
      `).run(
        id_compania,
        numAsiento,
        fecha || new Date().toISOString().split('T')[0],
        `Recibo de Caja #${numRecibo} - Abono: ${cliente.nombre}`,
        montoTotal,
        montoTotal
      );
      const idAsiento = rAsiento.lastInsertRowid;

      // Débito: Caja o Banco
      db.prepare(`
        INSERT INTO asientos_detalle (id_documento, id_cuenta, detalle_linea, tipo_movimiento, monto)
        VALUES (?, '11001001', ?, 'D', ?)
      `).run(idAsiento, `Ingreso por Recibo #${numRecibo}`, montoTotal);

      // Crédito: Clientes / CxC
      db.prepare(`
        INSERT INTO asientos_detalle (id_documento, id_cuenta, detalle_linea, tipo_movimiento, monto)
        VALUES (?, '11001001', ?, 'H', ?)
      `).run(idAsiento, `Abono de cartera #${numRecibo}`, montoTotal);

      // 3. Crear Recibo
      const rRecibo = db.prepare(`
        INSERT INTO recibos_caja (
          id_compania, numero_recibo, fecha, id_cliente, id_banco,
          monto, referencia, concepto, id_asiento
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id_compania,
        numRecibo,
        fecha || new Date().toISOString().split('T')[0],
        id_cliente,
        banco ? banco.id_banco : 1,
        montoTotal,
        referencia || null,
        concepto || `Cobro de facturas pendientes`,
        idAsiento
      );
      const idRecibo = rRecibo.lastInsertRowid;

      // 4. Aplicar a las facturas en CxC
      if (aplicaciones && Array.isArray(aplicaciones)) {
        for (const app of aplicaciones) {
          const cxc = db.prepare('SELECT * FROM cuentas_cobrar WHERE id_cxc = ?').get(app.id_cxc);
          if (cxc) {
            const abono = Math.min(Number(app.monto), cxc.saldo);
            const nuevoSaldo = cxc.saldo - abono;
            const nuevoPagado = cxc.monto_pagado + abono;
            const nuevoEstado = nuevoSaldo <= 0 ? 'PAGADA' : 'PARCIAL';

            db.prepare('UPDATE cuentas_cobrar SET saldo = ?, monto_pagado = ?, estado = ? WHERE id_cxc = ?')
              .run(nuevoSaldo, nuevoPagado, nuevoEstado, cxc.id_cxc);

            db.prepare(`
              INSERT INTO recibos_detalle (id_recibo, id_cxc, monto_aplicado)
              VALUES (?, ?, ?)
            `).run(idRecibo, cxc.id_cxc, abono);
          }
        }
      }

      // 5. Disminuir saldo del cliente y aumentar saldo en banco
      db.prepare('UPDATE clientes SET saldo_actual = MAX(0, saldo_actual - ?) WHERE id_cliente = ?')
        .run(montoTotal, id_cliente);

      if (banco) {
        db.prepare('UPDATE bancos_cuentas SET saldo_actual = saldo_actual + ? WHERE id_banco = ?')
          .run(montoTotal, banco.id_banco);
      }

      return { id_recibo: idRecibo, numero_recibo: numRecibo, monto: montoTotal };
    });

    res.status(201).json(resultado);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
