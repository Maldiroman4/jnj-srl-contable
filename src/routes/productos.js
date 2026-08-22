const express = require('express');
const { db, tx } = require('../db');
const router = express.Router();

// Listar productos
router.get('/', (req, res) => {
  const comp = Number(req.query.compania);
  if (!comp) return res.status(400).json({ error: 'Debe especificar el parámetro compania.' });
  const productos = db.prepare('SELECT * FROM productos WHERE id_compania = ? ORDER BY descripcion ASC').all(comp);
  res.json(productos);
});

// Obtener producto por ID
router.get('/:id', (req, res) => {
  const p = db.prepare('SELECT * FROM productos WHERE id_producto = ?').get(req.params.id);
  if (!p) return res.status(404).json({ error: 'Producto no encontrado.' });
  res.json(p);
});

// Crear producto
router.post('/', (req, res) => {
  const {
    id_compania, codigo, codigo_barra, codigo_cabys, descripcion, categoria, unidad,
    precio_venta, costo_unitario, impuesto_pct, stock_actual, stock_minimo,
    id_cuenta_ingreso, id_cuenta_costo, id_cuenta_inventario
  } = req.body || {};

  if (!id_compania || !codigo || !descripcion) {
    return res.status(400).json({ error: 'Compañía, código y descripción son obligatorios.' });
  }

  tx(() => {
    const r = db.prepare(`
      INSERT INTO productos (
        id_compania, codigo, codigo_barra, codigo_cabys, descripcion, categoria, unidad,
        precio_venta, costo_unitario, impuesto_pct, stock_actual, stock_minimo,
        id_cuenta_ingreso, id_cuenta_costo, id_cuenta_inventario
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id_compania,
      codigo.trim().toUpperCase(),
      codigo_barra || null,
      codigo_cabys ? codigo_cabys.trim() : null,
      descripcion.trim(),
      categoria || 'General',
      unidad || 'UND',
      Number(precio_venta) || 0,
      Number(costo_unitario) || 0,
      Number(impuesto_pct) || 13.0,
      Number(stock_actual) || 0,
      Number(stock_minimo) || 5,
      id_cuenta_ingreso || '50001001',
      id_cuenta_costo || '61001001',
      id_cuenta_inventario || '14001001'
    );

    const idProd = r.lastInsertRowid;

    // Si tiene stock inicial, registrar entrada en Kárdex
    if (Number(stock_actual) > 0) {
      db.prepare(`
        INSERT INTO movimientos_inventario (
          id_compania, id_producto, id_bodega, tipo, fecha, referencia,
          cantidad, costo_unitario, costo_total, saldo_cantidad, saldo_costo, detalle
        ) VALUES (?, ?, 1, 'ENTRADA', date('now'), 'APERTURA', ?, ?, ?, ?, ?, 'Inventario inicial')
      `).run(
        id_compania,
        idProd,
        Number(stock_actual),
        Number(costo_unitario) || 0,
        (Number(stock_actual) * (Number(costo_unitario) || 0)),
        Number(stock_actual),
        Number(costo_unitario) || 0
      );
    }

    res.status(201).json({ id_producto: idProd });
  });
});

// Kárdex de un producto
router.get('/:id/kardex', (req, res) => {
  const idProd = Number(req.params.id);
  const producto = db.prepare('SELECT * FROM productos WHERE id_producto = ?').get(idProd);
  if (!producto) return res.status(404).json({ error: 'Producto no encontrado.' });

  const movimientos = db.prepare(`
    SELECT m.*, b.nombre as bodega_nombre
    FROM movimientos_inventario m
    JOIN bodegas b ON b.id_bodega = m.id_bodega
    WHERE m.id_producto = ?
    ORDER BY m.id_movimiento ASC
  `).all(idProd);

  res.json({ producto, movimientos });
});

// Ajuste manual de inventario
router.post('/:id/ajuste', (req, res) => {
  const idProd = Number(req.params.id);
  const { tipo, cantidad, costo_unitario, motivo, id_compania } = req.body || {};
  const qty = Number(cantidad);
  if (!qty || qty <= 0) return res.status(400).json({ error: 'La cantidad debe ser mayor a cero.' });

  tx(() => {
    const prod = db.prepare('SELECT * FROM productos WHERE id_producto = ?').get(idProd);
    if (!prod) return res.status(404).json({ error: 'Producto no encontrado.' });

    let nuevoStock = prod.stock_actual;
    if (tipo === 'ENTRADA') {
      nuevoStock += qty;
    } else if (tipo === 'SALIDA') {
      if (prod.stock_actual < qty) throw new Error('Stock insuficiente para realizar el ajuste de salida.');
      nuevoStock -= qty;
    }

    db.prepare('UPDATE productos SET stock_actual = ? WHERE id_producto = ?').run(nuevoStock, idProd);

    db.prepare(`
      INSERT INTO movimientos_inventario (
        id_compania, id_producto, id_bodega, tipo, fecha, referencia,
        cantidad, costo_unitario, costo_total, saldo_cantidad, saldo_costo, detalle
      ) VALUES (?, ?, 1, ?, date('now'), 'AJUSTE', ?, ?, ?, ?, ?, ?)
    `).run(
      prod.id_compania,
      idProd,
      tipo,
      qty,
      Number(costo_unitario) || prod.costo_unitario,
      (qty * (Number(costo_unitario) || prod.costo_unitario)),
      nuevoStock,
      prod.costo_unitario,
      motivo || 'Ajuste manual de stock'
    );

    res.json({ ok: true, stock_actual: nuevoStock });
  });
});

module.exports = router;
