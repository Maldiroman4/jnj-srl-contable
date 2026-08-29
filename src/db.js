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

  // Migración de columnas mes_inicio y anio_inicio en companias
  try {
    const cols = db.prepare("PRAGMA table_info(companias)").all();
    const hasMesInicio = cols.some(c => c.name === 'mes_inicio');
    const hasAnioInicio = cols.some(c => c.name === 'anio_inicio');
    if (!hasMesInicio) {
      db.exec("ALTER TABLE companias ADD COLUMN mes_inicio INTEGER NOT NULL DEFAULT 1");
    }
    if (!hasAnioInicio) {
      db.exec("ALTER TABLE companias ADD COLUMN anio_inicio INTEGER NOT NULL DEFAULT 2026");
    }
  } catch (err) {
    console.error('Error al verificar columnas de companias:', err.message);
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

    CREATE TABLE IF NOT EXISTS usuarios (
      id_usuario INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      nombre_completo TEXT NOT NULL,
      rol TEXT NOT NULL DEFAULT 'ADMIN' CHECK (rol IN ('SUPER_ADMIN', 'ADMIN', 'CONTADOR', 'OPERADOR')),
      activo INTEGER NOT NULL DEFAULT 1,
      creado_en TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS auditoria_sesiones (
      id_sesion INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL,
      ip TEXT NOT NULL,
      pais TEXT DEFAULT 'Costa Rica',
      ciudad TEXT DEFAULT 'San José',
      dispositivo TEXT DEFAULT 'Desktop',
      navegador TEXT DEFAULT 'Chrome',
      sistema_operativo TEXT DEFAULT 'Windows',
      user_agent TEXT,
      fecha_hora TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      estado TEXT NOT NULL CHECK (estado IN ('EXITOSO', 'FALLIDO')),
      motivo_fallo TEXT
    );
  `);

  // Sembrar usuarios autorizados maestros
  db.exec(`
    INSERT OR REPLACE INTO usuarios (username, password, nombre_completo, rol, activo) VALUES
      ('Maldiroman777', '858585', 'Maldiroman · Super Usuario & Auditor de Seguridad', 'SUPER_ADMIN', 1),
      ('Joel777', '585858', 'Joel · Contador & Operador Contable', 'CONTADOR', 1);
  `);
  console.log('Base de datos inicializada limpia en 0 con usuarios autorizados.');
}

inicializar();

module.exports = { db, tx };