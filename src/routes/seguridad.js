const express = require('express');
const fs = require('fs');
const path = require('path');
const { db } = require('../db');
const router = express.Router();

// GET /api/seguridad/auditoria - Historial completo de accesos con conteo de dispositivo
router.get('/auditoria', (req, res) => {
  const limite = Number(req.query.limite) || 50;

  const registros = db.prepare(`
    SELECT a.*,
           (SELECT COUNT(*) 
            FROM auditoria_sesiones a2 
            WHERE a2.username = a.username 
              AND a2.dispositivo = a.dispositivo 
              AND a2.estado = 'EXITOSO'
              AND a2.id_sesion <= a.id_sesion) AS veces_iniciado
    FROM auditoria_sesiones a
    ORDER BY a.id_sesion DESC
    LIMIT ?
  `).all(limite);

  res.json(registros);
});

// GET /api/seguridad/stats - Métricas de seguridad para Maldiroman
router.get('/stats', (req, res) => {
  const total = db.prepare('SELECT COUNT(*) as c FROM auditoria_sesiones').get()?.c || 0;
  const exitosos = db.prepare("SELECT COUNT(*) as c FROM auditoria_sesiones WHERE estado = 'EXITOSO'").get()?.c || 0;
  const fallidos = db.prepare("SELECT COUNT(*) as c FROM auditoria_sesiones WHERE estado = 'FALLIDO'").get()?.c || 0;
  const dispositivosUnicos = db.prepare('SELECT COUNT(DISTINCT dispositivo || user_agent) as c FROM auditoria_sesiones').get()?.c || 0;
  const ipsUnicas = db.prepare('SELECT COUNT(DISTINCT ip) as c FROM auditoria_sesiones').get()?.c || 0;

  const porDispositivo = db.prepare(`
    SELECT dispositivo, COUNT(*) as cantidad, MAX(fecha_hora) as ultimo_acceso
    FROM auditoria_sesiones
    WHERE estado = 'EXITOSO'
    GROUP BY dispositivo
    ORDER BY cantidad DESC
  `).all();

  res.json({
    kpis: {
      total,
      exitosos,
      fallidos,
      dispositivosUnicos,
      ipsUnicas
    },
    porDispositivo
  });
});

// GET /api/seguridad/datos-cargados - Informe de datos y categorías cargadas en la Base de Datos
router.get('/datos-cargados', (req, res) => {
  try {
    // 1. Totales por categorías de datos
    const totalCompanias = db.prepare('SELECT COUNT(*) as c FROM companias').get()?.c || 0;
    const totalCuentas = db.prepare('SELECT COUNT(*) as c FROM catalogo_cuentas').get()?.c || 0;
    const totalAsientos = db.prepare('SELECT COUNT(*) as c FROM documentos_asientos').get()?.c || 0;
    const totalMovimientosContables = db.prepare('SELECT COUNT(*) as c FROM asientos_detalle').get()?.c || 0;
    const totalClientes = db.prepare('SELECT COUNT(*) as c FROM clientes').get()?.c || 0;
    const totalProveedores = db.prepare('SELECT COUNT(*) as c FROM proveedores').get()?.c || 0;
    const totalFacturas = db.prepare('SELECT COUNT(*) as c, COALESCE(SUM(total), 0) as monto FROM facturas').get() || { c: 0, monto: 0 };
    const totalFacturasContado = db.prepare("SELECT COUNT(*) as c FROM facturas WHERE tipo_pago = 'CONTADO'").get()?.c || 0;
    const totalFacturasCredito = db.prepare("SELECT COUNT(*) as c FROM facturas WHERE tipo_pago = 'CREDITO'").get()?.c || 0;
    const totalProductos = db.prepare('SELECT COUNT(*) as c, COALESCE(SUM(stock_actual), 0) as stock, COALESCE(SUM(stock_actual * costo_unitario), 0) as valor FROM productos').get() || { c: 0, stock: 0, valor: 0 };
    const totalBancos = db.prepare('SELECT COUNT(*) as c, COALESCE(SUM(saldo_actual), 0) as saldo FROM bancos_cuentas').get() || { c: 0, saldo: 0 };
    const totalRecibos = db.prepare('SELECT COUNT(*) as c, COALESCE(SUM(monto), 0) as monto FROM recibos_caja').get() || { c: 0, monto: 0 };
    const totalCxC = db.prepare("SELECT COUNT(*) as c, COALESCE(SUM(saldo), 0) as saldo FROM cuentas_cobrar WHERE estado != 'PAGADA'").get() || { c: 0, saldo: 0 };
    const totalKardex = db.prepare('SELECT COUNT(*) as c FROM movimientos_inventario').get()?.c || 0;

    // 2. Desglose detallado de Inventario por Categorías de Productos
    const productosPorCategoria = db.prepare(`
      SELECT 
        COALESCE(categoria, 'General') as categoria,
        COUNT(*) as total_items,
        SUM(stock_actual) as stock_total,
        SUM(stock_actual * costo_unitario) as valor_costo_total,
        SUM(stock_actual * precio_venta) as valor_venta_total
      FROM productos
      GROUP BY categoria
      ORDER BY total_items DESC
    `).all();

    // 3. Desglose de Cuentas Contables por Naturaleza
    const cuentasPorTipo = db.prepare(`
      SELECT 
        CASE 
          WHEN id_cuenta LIKE '1%' THEN 'Activo (1)'
          WHEN id_cuenta LIKE '2%' THEN 'Pasivo (2)'
          WHEN id_cuenta LIKE '3%' THEN 'Patrimonio (3)'
          WHEN id_cuenta LIKE '4%' THEN 'Ingresos (4)'
          WHEN id_cuenta LIKE '5%' THEN 'Costos (5)'
          WHEN id_cuenta LIKE '6%' THEN 'Gastos Operativos (6)'
          ELSE 'Otros'
        END as tipo_cuenta,
        COUNT(*) as cantidad
      FROM catalogo_cuentas
      GROUP BY tipo_cuenta
      ORDER BY tipo_cuenta
    `).all();

    // 4. Últimos datos cargados recientemente en cada tabla
    const ultimosProductos = db.prepare(`
      SELECT codigo, descripcion, categoria, stock_actual, precio_venta, costo_unitario 
      FROM productos 
      ORDER BY id_producto DESC 
      LIMIT 5
    `).all();

    const ultimasFacturas = db.prepare(`
      SELECT f.numero_factura, COALESCE(c.nombre, 'Consumidor Final') as cliente_nombre, f.fecha, f.tipo_pago, f.total 
      FROM facturas f 
      LEFT JOIN clientes c ON f.id_cliente = c.id_cliente
      ORDER BY f.id_factura DESC 
      LIMIT 5
    `).all();

    const ultimosAsientos = db.prepare(`
      SELECT a.numero_documento as numero, a.fecha, a.detalle_general as concepto, a.total_debitos as total_debe
      FROM documentos_asientos a
      ORDER BY a.id_documento DESC
      LIMIT 5
    `).all();

    const ultimosClientes = db.prepare(`
      SELECT codigo, nombre, cedula_rnc, telefono, email 
      FROM clientes 
      ORDER BY id_cliente DESC 
      LIMIT 5
    `).all();

    // 5. Estado físico del archivo de Base de Datos SQLite
    let dbSizeKB = 0;
    const dbPath = path.join(__dirname, '..', '..', 'data', 'contabilidad.db');
    if (fs.existsSync(dbPath)) {
      dbSizeKB = Math.round(fs.statSync(dbPath).size / 1024);
    }

    res.json({
      resumen_general: {
        totalCompanias,
        totalCuentas,
        totalAsientos,
        totalMovimientosContables,
        totalClientes,
        totalProveedores,
        totalProductos: totalProductos.c,
        stockTotalProductos: totalProductos.stock,
        valorInventario: totalProductos.valor,
        totalFacturas: totalFacturas.c,
        montoFacturado: totalFacturas.monto,
        totalFacturasContado,
        totalFacturasCredito,
        totalBancos: totalBancos.c,
        saldoBancos: totalBancos.saldo,
        totalRecibos: totalRecibos.c,
        montoRecibos: totalRecibos.monto,
        totalCxC: totalCxC.c,
        saldoPendienteCxC: totalCxC.saldo,
        totalKardex,
        dbSizeKB
      },
      productosPorCategoria,
      cuentasPorTipo,
      ultimos_cargados: {
        productos: ultimosProductos,
        facturas: ultimasFacturas,
        asientos: ultimosAsientos,
        clientes: ultimosClientes
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/seguridad/usuarios - Lista de usuarios
router.get('/usuarios', (req, res) => {
  const usuarios = db.prepare('SELECT id_usuario, username, nombre_completo, rol, activo, creado_en FROM usuarios ORDER BY id_usuario').all();
  res.json(usuarios);
});

module.exports = router;
