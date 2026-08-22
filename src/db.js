const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'contabilidad.db');
const IMPORTADO = path.join(DATA_DIR, 'importado.db');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Restauración pendiente: si hay un importado.db subido, reemplaza la base
// actual antes de abrirla (debe reiniciarse el servidor para aplicar).
if (fs.existsSync(IMPORTADO)) {
  for (const suf of ['', '-wal', '-shm']) {
    const f = DB_FILE + suf;
    if (fs.existsSync(f)) fs.unlinkSync(f);
  }
  fs.renameSync(IMPORTADO, DB_FILE);
  console.log('Base de datos restaurada desde importado.db.');
}

const db = new DatabaseSync(DB_FILE);
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

// Transacción atómica con soporte de anidamiento vía savepoints.
let txDepth = 0;
function tx(fn) {
  if (txDepth > 0) {
    const sp = `sp_${txDepth}`;
    db.exec(`SAVEPOINT ${sp}`);
    txDepth++;
    try {
      const r = fn();
      db.exec(`RELEASE ${sp}`);
      txDepth--;
      return r;
    } catch (e) {
      txDepth--;
      db.exec(`ROLLBACK TO ${sp}`);
      db.exec(`RELEASE ${sp}`);
      throw e;
    }
  }
  txDepth++;
  db.exec('BEGIN');
  try {
    const r = fn();
    db.exec('COMMIT');
    txDepth--;
    return r;
  } catch (e) {
    txDepth--;
    db.exec('ROLLBACK');
    throw e;
  }
}

function inicializar() {
  const marcador = path.join(DATA_DIR, '.inicializado');
  if (!fs.existsSync(marcador)) {
    const schema = fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8');
    db.exec(schema);
    fs.writeFileSync(marcador, new Date().toISOString());
    console.log('Base de datos inicializada con el esquema contable base.');
  }

  // Inicializar Módulos de MONICA (Clientes, Proveedores, Inventario, Facturación, CxC, CxP, Bancos)
  db.exec(`
    CREATE TABLE IF NOT EXISTS clientes (
      id_cliente INTEGER PRIMARY KEY AUTOINCREMENT,
      id_compania INTEGER NOT NULL REFERENCES companias(id_compania),
      codigo TEXT NOT NULL,
      nombre TEXT NOT NULL,
      cedula_rnc TEXT,
      telefono TEXT,
      email TEXT,
      direccion TEXT,
      limite_credito REAL NOT NULL DEFAULT 0,
      dias_credito INTEGER NOT NULL DEFAULT 30,
      saldo_actual REAL NOT NULL DEFAULT 0,
      UNIQUE(id_compania, codigo)
    );

    CREATE TABLE IF NOT EXISTS proveedores (
      id_proveedor INTEGER PRIMARY KEY AUTOINCREMENT,
      id_compania INTEGER NOT NULL REFERENCES companias(id_compania),
      codigo TEXT NOT NULL,
      nombre TEXT NOT NULL,
      rnc TEXT,
      telefono TEXT,
      email TEXT,
      direccion TEXT,
      saldo_actual REAL NOT NULL DEFAULT 0,
      UNIQUE(id_compania, codigo)
    );

    CREATE TABLE IF NOT EXISTS bodegas (
      id_bodega INTEGER PRIMARY KEY AUTOINCREMENT,
      id_compania INTEGER NOT NULL REFERENCES companias(id_compania),
      codigo TEXT NOT NULL,
      nombre TEXT NOT NULL,
      direccion TEXT,
      es_principal INTEGER NOT NULL DEFAULT 1,
      UNIQUE(id_compania, codigo)
    );

    CREATE TABLE IF NOT EXISTS productos (
      id_producto INTEGER PRIMARY KEY AUTOINCREMENT,
      id_compania INTEGER NOT NULL REFERENCES companias(id_compania),
      codigo TEXT NOT NULL,
      codigo_barra TEXT,
      codigo_cabys TEXT,
      descripcion TEXT NOT NULL,
      categoria TEXT DEFAULT 'General',
      unidad TEXT NOT NULL DEFAULT 'UND',
      precio_venta REAL NOT NULL DEFAULT 0,
      costo_unitario REAL NOT NULL DEFAULT 0,
      impuesto_pct REAL NOT NULL DEFAULT 13.0,
      stock_actual REAL NOT NULL DEFAULT 0,
      stock_minimo REAL NOT NULL DEFAULT 5,
      id_cuenta_ingreso TEXT,
      id_cuenta_costo TEXT,
      id_cuenta_inventario TEXT,
      UNIQUE(id_compania, codigo)
    );
  `);

  // Migración para bases de datos existentes: asegurar que exista la columna codigo_cabys
  try {
    db.exec("ALTER TABLE productos ADD COLUMN codigo_cabys TEXT;");
  } catch (e) {
    // La columna ya existe, continuar normalmente
  }

  db.exec(`

    CREATE TABLE IF NOT EXISTS movimientos_inventario (
      id_movimiento INTEGER PRIMARY KEY AUTOINCREMENT,
      id_compania INTEGER NOT NULL REFERENCES companias(id_compania),
      id_producto INTEGER NOT NULL REFERENCES productos(id_producto),
      id_bodega INTEGER NOT NULL REFERENCES bodegas(id_bodega),
      tipo TEXT NOT NULL CHECK (tipo IN ('ENTRADA', 'SALIDA', 'AJUSTE', 'VENTA', 'COMPRA')),
      fecha TEXT NOT NULL,
      referencia TEXT,
      cantidad REAL NOT NULL,
      costo_unitario REAL NOT NULL DEFAULT 0,
      costo_total REAL NOT NULL DEFAULT 0,
      saldo_cantidad REAL NOT NULL,
      saldo_costo REAL NOT NULL,
      detalle TEXT
    );

    CREATE TABLE IF NOT EXISTS facturas (
      id_factura INTEGER PRIMARY KEY AUTOINCREMENT,
      id_compania INTEGER NOT NULL REFERENCES companias(id_compania),
      numero_factura TEXT NOT NULL,
      tipo_pago TEXT NOT NULL CHECK (tipo_pago IN ('CONTADO', 'CREDITO')),
      id_cliente INTEGER NOT NULL REFERENCES clientes(id_cliente),
      fecha TEXT NOT NULL,
      fecha_vencimiento TEXT NOT NULL,
      subtotal REAL NOT NULL DEFAULT 0,
      descuento REAL NOT NULL DEFAULT 0,
      impuesto REAL NOT NULL DEFAULT 0,
      total REAL NOT NULL DEFAULT 0,
      estado TEXT NOT NULL DEFAULT 'EMITIDA' CHECK (estado IN ('EMITIDA', 'PAGADA', 'ANULADA', 'PARCIAL')),
      id_asiento INTEGER,
      notas TEXT,
      UNIQUE(id_compania, numero_factura)
    );

    CREATE TABLE IF NOT EXISTS facturas_detalle (
      id_detalle INTEGER PRIMARY KEY AUTOINCREMENT,
      id_factura INTEGER NOT NULL REFERENCES facturas(id_factura) ON DELETE CASCADE,
      id_producto INTEGER NOT NULL REFERENCES productos(id_producto),
      cantidad REAL NOT NULL,
      precio_unitario REAL NOT NULL,
      costo_unitario REAL NOT NULL DEFAULT 0,
      descuento_pct REAL NOT NULL DEFAULT 0,
      impuesto_pct REAL NOT NULL DEFAULT 0,
      total REAL NOT NULL
    );

    CREATE TABLE IF NOT EXISTS cuentas_cobrar (
      id_cxc INTEGER PRIMARY KEY AUTOINCREMENT,
      id_compania INTEGER NOT NULL REFERENCES companias(id_compania),
      id_cliente INTEGER NOT NULL REFERENCES clientes(id_cliente),
      id_factura INTEGER NOT NULL REFERENCES facturas(id_factura),
      fecha TEXT NOT NULL,
      fecha_vencimiento TEXT NOT NULL,
      monto_total REAL NOT NULL,
      monto_pagado REAL NOT NULL DEFAULT 0,
      saldo REAL NOT NULL,
      estado TEXT NOT NULL DEFAULT 'PENDIENTE' CHECK (estado IN ('PENDIENTE', 'PARCIAL', 'PAGADA', 'VENCIDA'))
    );

    CREATE TABLE IF NOT EXISTS cuentas_pagar (
      id_cxp INTEGER PRIMARY KEY AUTOINCREMENT,
      id_compania INTEGER NOT NULL REFERENCES companias(id_compania),
      id_proveedor INTEGER NOT NULL REFERENCES proveedores(id_proveedor),
      documento_ref TEXT NOT NULL,
      fecha TEXT NOT NULL,
      fecha_vencimiento TEXT NOT NULL,
      monto_total REAL NOT NULL,
      monto_pagado REAL NOT NULL DEFAULT 0,
      saldo REAL NOT NULL,
      estado TEXT NOT NULL DEFAULT 'PENDIENTE' CHECK (estado IN ('PENDIENTE', 'PARCIAL', 'PAGADA', 'VENCIDA'))
    );

    CREATE TABLE IF NOT EXISTS bancos_cuentas (
      id_banco INTEGER PRIMARY KEY AUTOINCREMENT,
      id_compania INTEGER NOT NULL REFERENCES companias(id_compania),
      codigo TEXT NOT NULL,
      nombre TEXT NOT NULL,
      numero_cuenta TEXT,
      saldo_actual REAL NOT NULL DEFAULT 0,
      id_cuenta_contable TEXT,
      UNIQUE(id_compania, codigo)
    );

    CREATE TABLE IF NOT EXISTS recibos_caja (
      id_recibo INTEGER PRIMARY KEY AUTOINCREMENT,
      id_compania INTEGER NOT NULL REFERENCES companias(id_compania),
      numero_recibo TEXT NOT NULL,
      fecha TEXT NOT NULL,
      id_cliente INTEGER NOT NULL REFERENCES clientes(id_cliente),
      id_banco INTEGER NOT NULL REFERENCES bancos_cuentas(id_banco),
      monto REAL NOT NULL,
      referencia TEXT,
      concepto TEXT,
      id_asiento INTEGER,
      UNIQUE(id_compania, numero_recibo)
    );

    CREATE TABLE IF NOT EXISTS recibos_detalle (
      id_recibo_det INTEGER PRIMARY KEY AUTOINCREMENT,
      id_recibo INTEGER NOT NULL REFERENCES recibos_caja(id_recibo) ON DELETE CASCADE,
      id_cxc INTEGER NOT NULL REFERENCES cuentas_cobrar(id_cxc),
      monto_aplicado REAL NOT NULL
    );
  `);

  // Sembrar datos iniciales de MONICA si no existen
  const compCount = db.prepare('SELECT COUNT(*) as c FROM bodegas WHERE id_compania = 24').get();
  if (compCount.c === 0) {
    db.exec(`
      INSERT OR IGNORE INTO bodegas (id_compania, codigo, nombre, direccion, es_principal) VALUES
        (24, 'BOD-01', 'Bodega Principal Central', 'San José, Costa Rica', 1),
        (24, 'BOD-02', 'Almacén de Sucursal', 'Alajuela', 0),
        (1,  'BOD-01', 'Bodega Principal', 'Oficina Central', 1);

      INSERT OR IGNORE INTO clientes (id_compania, codigo, nombre, cedula_rnc, telefono, email, direccion, limite_credito, dias_credito, saldo_actual) VALUES
        (24, 'CLI-001', 'Consumidor Final', '0-000-000000', '2222-0000', 'ventas@cliente.com', 'Mostrador', 0, 0, 0),
        (24, 'CLI-002', 'Distribuidora Monte Real S.A.', '3-101-555888', '2430-1122', 'compras@montereal.cr', 'Paseo Colón, San José', 5000000, 30, 452000),
        (24, 'CLI-003', 'Taller y Repuestos del Este', '3-102-333444', '2280-9988', 'contacto@repuestoseste.com', 'Curridabat', 2000000, 15, 0),
        (1,  'CLI-001', 'Cliente General Demo', '1-111-111111', '2200-1100', 'demo@cliente.com', 'Central', 1000000, 30, 0);

      INSERT OR IGNORE INTO proveedores (id_compania, codigo, nombre, rnc, telefono, email, direccion, saldo_actual) VALUES
        (24, 'PRV-001', 'Importaciones Industriales Globales S.A.', '3-101-777666', '2290-4455', 'ventas@globalcr.com', 'Heredia, Zona Franca', 1250000),
        (24, 'PRV-002', 'Lubricantes y Filtros de Centroamérica', '3-101-112233', '2440-5566', 'pedidos@lubricentral.com', 'San José', 0),
        (1,  'PRV-001', 'Proveedor de Prueba S.A.', '3-101-999000', '2233-4455', 'info@provprueba.com', 'San José', 0);

      INSERT OR IGNORE INTO productos (id_compania, codigo, codigo_barra, descripcion, categoria, unidad, precio_venta, costo_unitario, impuesto_pct, stock_actual, stock_minimo, id_cuenta_ingreso, id_cuenta_costo, id_cuenta_inventario) VALUES
        (24, 'ART-001', '7501001122334', 'Aceite Motor Sintético 5W-30 (Galón)', 'Lubricantes', 'GAL', 28500.00, 17500.00, 13.0, 45, 10, '50001001', '61001001', '14001001'),
        (24, 'ART-002', '7501001122341', 'Filtro de Aceite Premium Alto Flujo', 'Filtros', 'UND', 8500.00, 4200.00, 13.0, 120, 20, '50001001', '61001001', '14001001'),
        (24, 'ART-003', '7501001122358', 'Líquido de Frenos DOT 4 (500ml)', 'Fluidos', 'UND', 6200.00, 3100.00, 13.0, 80, 15, '50001001', '61001001', '14001001'),
        (24, 'ART-004', '7501001122365', 'Pastillas de Freno Cerámicas Delanteras', 'Frenos', 'JGO', 34000.00, 19500.00, 13.0, 28, 5, '50001001', '61001001', '14001001'),
        (24, 'SRV-001', '', 'Mantenimiento Preventivo / Afinamiento General', 'Servicios', 'SRV', 45000.00, 0.00, 13.0, 999, 0, '50001001', '61001001', '14001001'),
        (1,  'ART-001', '7501001122334', 'Producto de Muestra Demo', 'General', 'UND', 10000.00, 6000.00, 13.0, 50, 10, '50001001', '61001001', '14001001');

      INSERT OR IGNORE INTO bancos_cuentas (id_compania, codigo, nombre, numero_cuenta, saldo_actual, id_cuenta_contable) VALUES
        (24, 'BCO-01', 'Caja General Mostrador', 'CAJA-01', 350000.00, '11001001'),
        (24, 'BCO-02', 'Banco BAC San José (Cta. Corriente)', 'CR05010200009988776655', 8540000.00, '11001001'),
        (1,  'BCO-01', 'Caja Principal Demo', 'CAJA-DEMO', 100000.00, '11001001');

      -- Kárdex inicial
      INSERT OR IGNORE INTO movimientos_inventario (id_compania, id_producto, id_bodega, tipo, fecha, referencia, cantidad, costo_unitario, costo_total, saldo_cantidad, saldo_costo, detalle)
      SELECT id_compania, id_producto, 1, 'ENTRADA', '2026-08-01', 'INV-INICIAL', stock_actual, costo_unitario, stock_actual * costo_unitario, stock_actual, costo_unitario, 'Inventario inicial de apertura'
      FROM productos WHERE id_compania = 24 AND stock_actual > 0;
    `);
    console.log('Módulos de MONICA inicializados con datos de prueba.');
  }
}

inicializar();

module.exports = { db, tx };