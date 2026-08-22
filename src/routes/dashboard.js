const express = require('express');
const { db } = require('../db');
const router = express.Router();

router.get('/stats', (req, res) => {
  const comp = Number(req.query.compania);
  if (!comp) return res.status(400).json({ error: 'Debe especificar el parámetro compania.' });

  // 1. Total Ventas
  const v = db.prepare('SELECT COALESCE(SUM(total), 0) as total_ventas, COUNT(*) as cant_facturas FROM facturas WHERE id_compania = ?').get(comp);

  // 2. Cartera CxC
  const cxc = db.prepare(`
    SELECT COALESCE(SUM(saldo), 0) as total_cxc,
           COALESCE(SUM(CASE WHEN fecha_vencimiento < date('now') THEN saldo ELSE 0 END), 0) as cxc_vencida
    FROM cuentas_cobrar
    WHERE id_compania = ? AND estado != 'PAGADA'
  `).get(comp);

  // 3. Valoración de Inventario
  const inv = db.prepare('SELECT COALESCE(SUM(stock_actual * costo_unitario), 0) as valor_inventario, COUNT(*) as total_productos FROM productos WHERE id_compania = ?').get(comp);

  // 4. Saldo en Bancos y Caja
  const bco = db.prepare('SELECT COALESCE(SUM(saldo_actual), 0) as total_bancos FROM bancos_cuentas WHERE id_compania = ?').get(comp);

  // 5. Últimas Facturas
  const ultimasFacturas = db.prepare(`
    SELECT f.id_factura, f.numero_factura, f.fecha, f.total, f.tipo_pago, f.estado, c.nombre as cliente_nombre
    FROM facturas f
    JOIN clientes c ON c.id_cliente = f.id_cliente
    WHERE f.id_compania = ?
    ORDER BY f.id_factura DESC
    LIMIT 5
  `).all(comp);

  // 6. Productos con bajo stock
  const bajoStock = db.prepare(`
    SELECT id_producto, codigo, descripcion, stock_actual, stock_minimo
    FROM productos
    WHERE id_compania = ? AND stock_actual <= stock_minimo AND categoria != 'Servicios'
    LIMIT 5
  `).all(comp);

  res.json({
    kpis: {
      totalVentas: v.total_ventas,
      cantFacturas: v.cant_facturas,
      totalCxC: cxc.total_cxc,
      cxcVencida: cxc.cxc_vencida,
      valorInventario: inv.valor_inventario,
      totalProductos: inv.total_productos,
      totalBancos: bco.total_bancos
    },
    ultimasFacturas,
    bajoStock
  });
});

module.exports = router;
