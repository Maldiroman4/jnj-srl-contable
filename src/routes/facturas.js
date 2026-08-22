const express = require('express');
const { db, tx } = require('../db');
const router = express.Router();

// Listar facturas
router.get('/', (req, res) => {
  const comp = Number(req.query.compania);
  if (!comp) return res.status(400).json({ error: 'Debe especificar el parámetro compania.' });

  const facturas = db.prepare(`
    SELECT f.*, c.nombre as cliente_nombre, c.cedula_rnc
    FROM facturas f
    JOIN clientes c ON c.id_cliente = f.id_cliente
    WHERE f.id_compania = ?
    ORDER BY f.id_factura DESC
  `).all(comp);

  res.json(facturas);
});

// Detalle de una factura
router.get('/:id', (req, res) => {
  const idFactura = Number(req.params.id);
  const factura = db.prepare(`
    SELECT f.*, c.nombre as cliente_nombre, c.cedula_rnc, c.direccion as cliente_direccion, c.telefono as cliente_telefono
    FROM facturas f
    JOIN clientes c ON c.id_cliente = f.id_cliente
    WHERE f.id_factura = ?
  `).get(idFactura);

  if (!factura) return res.status(404).json({ error: 'Factura no encontrada.' });

  const detalle = db.prepare(`
    SELECT d.*, p.codigo, p.descripcion, p.unidad
    FROM facturas_detalle d
    JOIN productos p ON p.id_producto = d.id_producto
    WHERE d.id_factura = ?
  `).all(idFactura);

  // Asiento contable si existe
  let asiento = null;
  if (factura.id_asiento) {
    const doc = db.prepare('SELECT * FROM documentos_asientos WHERE id_documento = ?').get(factura.id_asiento);
    const lineas = db.prepare(`
      SELECT l.*, c.descripcion as cuenta_descripcion
      FROM asientos_detalle l
      JOIN catalogo_cuentas c ON c.id_cuenta = l.id_cuenta
      WHERE l.id_documento = ?
    `).all(factura.id_asiento);
    asiento = { ...doc, lineas };
  }

  res.json({ factura, detalle, asiento });
});

// Emitir Factura Comercial (POS / Crédito con Partida Doble Atómica)
router.post('/', (req, res) => {
  const {
    id_compania, id_cliente, tipo_pago, fecha, fecha_vencimiento,
    items, notas
  } = req.body || {};

  if (!id_compania || !id_cliente || !items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Compañía, cliente y productos son requeridos.' });
  }

  try {
    const resultado = tx(() => {
      // 1. Validar cliente
      const cliente = db.prepare('SELECT * FROM clientes WHERE id_cliente = ?').get(id_cliente);
      if (!cliente) throw new Error('Cliente no existe.');

      // 2. Generar número de factura correlativo
      const last = db.prepare('SELECT id_factura FROM facturas WHERE id_compania = ? ORDER BY id_factura DESC LIMIT 1').get(id_compania);
      const nextNum = (last ? last.id_factura + 1 : 1).toString().padStart(6, '0');
      const numFactura = `FAC-${nextNum}`;

      let subtotal = 0;
      let totalDescuento = 0;
      let totalImpuesto = 0;
      let totalGeneral = 0;
      let totalCosto = 0;

      const lineasFactura = [];

      // 3. Procesar items y validar/descontar stock
      for (const it of items) {
        const prod = db.prepare('SELECT * FROM productos WHERE id_producto = ?').get(it.id_producto);
        if (!prod) throw new Error(`Producto con ID ${it.id_producto} no existe.`);

        const cant = Number(it.cantidad) || 1;
        const precio = Number(it.precio_unitario) >= 0 ? Number(it.precio_unitario) : prod.precio_venta;
        const descPct = Number(it.descuento_pct) || 0;
        const impPct = Number(prod.impuesto_pct) || 0;

        // Validar stock si no es servicio
        if (prod.categoria !== 'Servicios' && prod.stock_actual < cant) {
          throw new Error(`Stock insuficiente para el artículo [${prod.codigo} - ${prod.descripcion}]. Disponible: ${prod.stock_actual}, Solicitado: ${cant}`);
        }

        const montoBruto = cant * precio;
        const montoDesc = montoBruto * (descPct / 100);
        const montoNeto = montoBruto - montoDesc;
        const montoImp = montoNeto * (impPct / 100);
        const totalLinea = montoNeto + montoImp;
        const costoLinea = cant * prod.costo_unitario;

        subtotal += montoNeto;
        totalDescuento += montoDesc;
        totalImpuesto += montoImp;
        totalGeneral += totalLinea;
        totalCosto += costoLinea;

        // Descontar stock
        const nuevoStock = prod.stock_actual - cant;
        db.prepare('UPDATE productos SET stock_actual = ? WHERE id_producto = ?').run(nuevoStock, prod.id_producto);

        // Kárdex
        db.prepare(`
          INSERT INTO movimientos_inventario (
            id_compania, id_producto, id_bodega, tipo, fecha, referencia,
            cantidad, costo_unitario, costo_total, saldo_cantidad, saldo_costo, detalle
          ) VALUES (?, ?, 1, 'VENTA', ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          id_compania,
          prod.id_producto,
          fecha || new Date().toISOString().split('T')[0],
          numFactura,
          cant,
          prod.costo_unitario,
          costoLinea,
          nuevoStock,
          prod.costo_unitario,
          `Venta Fac #${numFactura} a ${cliente.nombre}`
        );

        lineasFactura.push({
          id_producto: prod.id_producto,
          cantidad: cant,
          precio_unitario: precio,
          costo_unitario: prod.costo_unitario,
          descuento_pct: descPct,
          impuesto_pct: impPct,
          total: totalLinea
        });
      }

      // 4. GENERAR ASIENTO CONTABLE AUTOMÁTICO (Partida Doble)
      const numAsiento = `2026-F${nextNum}`;
      const rAsiento = db.prepare(`
        INSERT INTO documentos_asientos (
          id_compania, tipo_documento, numero_documento, fecha, detalle_general, total_debitos, total_creditos
        ) VALUES (?, 1, ?, ?, ?, ?, ?)
      `).run(
        id_compania,
        numAsiento,
        fecha || new Date().toISOString().split('T')[0],
        `Venta Factura #${numFactura} - ${cliente.nombre}`,
        (totalGeneral + totalCosto),
        (totalGeneral + totalCosto)
      );
      const idAsiento = rAsiento.lastInsertRowid;

      // Línea 1: Débito a Caja o Clientes por Cobrar
      const ctaCobro = (tipo_pago === 'CREDITO') ? '11001001' : '11001001'; // Caja o CxC
      db.prepare(`
        INSERT INTO asientos_detalle (id_documento, id_cuenta, detalle_linea, tipo_movimiento, monto)
        VALUES (?, ?, ?, 'D', ?)
      `).run(idAsiento, ctaCobro, `Cobro Factura #${numFactura}`, totalGeneral);

      // Línea 2: Crédito a Ingresos por Ventas
      db.prepare(`
        INSERT INTO asientos_detalle (id_documento, id_cuenta, detalle_linea, tipo_movimiento, monto)
        VALUES (?, '50001001', ?, 'H', ?)
      `).run(idAsiento, `Ingreso Venta Factura #${numFactura}`, subtotal);

      // Línea 3: Crédito a IVA por Pagar
      if (totalImpuesto > 0) {
        db.prepare(`
          INSERT INTO asientos_detalle (id_documento, id_cuenta, detalle_linea, tipo_movimiento, monto)
          VALUES (?, '21002001', ?, 'H', ?)
        `).run(idAsiento, `IVA Factura #${numFactura}`, totalImpuesto);
      }

      // Líneas 4 y 5: Costo de Ventas e Inventario
      if (totalCosto > 0) {
        db.prepare(`
          INSERT INTO asientos_detalle (id_documento, id_cuenta, detalle_linea, tipo_movimiento, monto)
          VALUES (?, '61001001', ?, 'D', ?)
        `).run(idAsiento, `Costo Mercadería Fac #${numFactura}`, totalCosto);

        db.prepare(`
          INSERT INTO asientos_detalle (id_documento, id_cuenta, detalle_linea, tipo_movimiento, monto)
          VALUES (?, '11001001', ?, 'H', ?)
        `).run(idAsiento, `Descargo Inventario Fac #${numFactura}`, totalCosto);
      }

      // 5. Guardar Factura
      const rFactura = db.prepare(`
        INSERT INTO facturas (
          id_compania, numero_factura, tipo_pago, id_cliente, fecha, fecha_vencimiento,
          subtotal, descuento, impuesto, total, estado, id_asiento, notas
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id_compania,
        numFactura,
        tipo_pago || 'CONTADO',
        id_cliente,
        fecha || new Date().toISOString().split('T')[0],
        fecha_vencimiento || fecha || new Date().toISOString().split('T')[0],
        subtotal,
        totalDescuento,
        totalImpuesto,
        totalGeneral,
        tipo_pago === 'CONTADO' ? 'PAGADA' : 'EMITIDA',
        idAsiento,
        notas || null
      );
      const idFactura = rFactura.lastInsertRowid;

      // 6. Guardar líneas de factura
      for (const l of lineasFactura) {
        db.prepare(`
          INSERT INTO facturas_detalle (
            id_factura, id_producto, cantidad, precio_unitario, costo_unitario,
            descuento_pct, impuesto_pct, total
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          idFactura,
          l.id_producto,
          l.cantidad,
          l.precio_unitario,
          l.costo_unitario,
          l.descuento_pct,
          l.impuesto_pct,
          l.total
        );
      }

      // 7. Si es a Crédito -> Registrar en Cuentas por Cobrar (CxC)
      if (tipo_pago === 'CREDITO') {
        db.prepare(`
          INSERT INTO cuentas_cobrar (
            id_compania, id_cliente, id_factura, fecha, fecha_vencimiento,
            monto_total, monto_pagado, saldo, estado
          ) VALUES (?, ?, ?, ?, ?, ?, 0, ?, 'PENDIENTE')
        `).run(
          id_compania,
          id_cliente,
          idFactura,
          fecha || new Date().toISOString().split('T')[0],
          fecha_vencimiento || new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
          totalGeneral,
          totalGeneral
        );

        // Actualizar saldo deudor del cliente
        db.prepare('UPDATE clientes SET saldo_actual = saldo_actual + ? WHERE id_cliente = ?')
          .run(totalGeneral, id_cliente);
      }

      return {
        id_factura: idFactura,
        numero_factura: numFactura,
        total: totalGeneral,
        id_asiento: idAsiento
      };
    });

    res.status(201).json(resultado);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
