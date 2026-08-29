PRAGMA foreign_keys = ON;

-- ============================================================
-- CLASES DE CUENTA (estandarización MAETIC del sistema original)
-- ============================================================
CREATE TABLE IF NOT EXISTS clases_cuenta (
  id_clase              INTEGER PRIMARY KEY,
  nombre                TEXT    NOT NULL,
  tipo_rubro            TEXT    NOT NULL CHECK (tipo_rubro IN ('ACTIVO','PASIVO','PATRIMONIO','INGRESO','EGRESO','ORDEN'))
);

INSERT OR IGNORE INTO clases_cuenta (id_clase, nombre, tipo_rubro) VALUES
  (1,  'Activo Circulante',        'ACTIVO'),
  (2,  'Cuentas por Cobrar',       'ACTIVO'),
  (3,  'Activo Fijo',              'ACTIVO'),
  (4,  'Otros Activos',            'ACTIVO'),
  (5,  'Pasivo Corto Plazo',       'PASIVO'),
  (6,  'Cuentas por Pagar',        'PASIVO'),
  (7,  'Pasivo Largo Plazo',       'PASIVO'),
  (8,  'Capital Contable / Patrimonio', 'PATRIMONIO'),
  (10, 'Ingresos',                 'INGRESO'),
  (11, 'Egresos',                  'EGRESO'),
  (12, 'Costo de Ventas',          'EGRESO'),
  (13, 'Ingresos por Ventas',      'INGRESO'),
  (15, 'Ingresos No Gravables',    'INGRESO'),
  (16, 'Egresos No Deducibles',    'EGRESO'),
  (18, 'Cuentas de Orden',         'ORDEN'),
  (19, 'Cuentas de Orden',         'ORDEN');

-- ============================================================
-- COMPAÑÍAS (Multi-empresa, períodos y lotes)
-- ============================================================
CREATE TABLE IF NOT EXISTS companias (
  id_compania       INTEGER PRIMARY KEY,
  razon_social      TEXT    NOT NULL,
  cedula_juridica   TEXT,
  mes_inicio        INTEGER NOT NULL DEFAULT 1 CHECK (mes_inicio BETWEEN 1 AND 12),
  anio_inicio       INTEGER NOT NULL DEFAULT 2026 CHECK (anio_inicio BETWEEN 1900 AND 2100),
  mes_activo        INTEGER NOT NULL DEFAULT 1 CHECK (mes_activo BETWEEN 1 AND 12),
  ano_activo        INTEGER NOT NULL DEFAULT 2026
);

-- ============================================================
-- CATÁLOGO DE CUENTAS (máscara XXX-XX-XXX, 8 dígitos)
--   - es_cuenta_mayor: TRUE si nivel2='00' y nivel3='000'
--   - es_desglose:     TRUE si no posee hijos (último nivel)
--   - la clase SOLO se digita en la cuenta mayor; se hereda
-- ============================================================
CREATE TABLE IF NOT EXISTS catalogo_cuentas (
  id_cuenta            TEXT    PRIMARY KEY,          -- 8 dígitos sin guiones ('11001001')
  id_compania          INTEGER NOT NULL REFERENCES companias(id_compania),
  nivel1               TEXT    NOT NULL CHECK (length(nivel1) = 3),
  nivel2               TEXT    NOT NULL CHECK (length(nivel2) = 2),
  nivel3               TEXT    NOT NULL CHECK (length(nivel3) = 3),
  descripcion          TEXT    NOT NULL,
  descripcion_ingles   TEXT,
  clase_cuenta_id      INTEGER NOT NULL REFERENCES clases_cuenta(id_clase),
  es_cuenta_mayor      INTEGER NOT NULL DEFAULT 0,
  es_desglose          INTEGER NOT NULL DEFAULT 0,
  detalle1             TEXT,
  detalle2             TEXT,
  codigo_cabys         TEXT,
  codigo_barras        TEXT,
  presupuesta          INTEGER NOT NULL DEFAULT 0,
  monto_presupuestado  REAL    NOT NULL DEFAULT 0,
  UNIQUE (id_compania, nivel1, nivel2, nivel3)
);

-- ============================================================
-- DOCUMENTOS / ASIENTOS (encabezado)
-- ============================================================
CREATE TABLE IF NOT EXISTS documentos_asientos (
  id_documento     INTEGER PRIMARY KEY AUTOINCREMENT,
  id_compania      INTEGER NOT NULL REFERENCES companias(id_compania),
  tipo_documento   INTEGER NOT NULL DEFAULT 1,  -- 1=General 2=Ingreso 3=Gasto 77=Cheque
  numero_documento TEXT    NOT NULL,
  fecha            TEXT    NOT NULL,             -- YYYY-MM-DD
  detalle_general  TEXT,
  total_debitos    REAL    NOT NULL DEFAULT 0,
  total_creditos   REAL    NOT NULL DEFAULT 0,
  UNIQUE (id_compania, numero_documento)
);

-- ============================================================
-- LÍNEAS DEL ASIENTO (partida doble)
-- ============================================================
CREATE TABLE IF NOT EXISTS asientos_detalle (
  id_linea        INTEGER PRIMARY KEY AUTOINCREMENT,
  id_documento    INTEGER NOT NULL REFERENCES documentos_asientos(id_documento) ON DELETE CASCADE,
  id_cuenta       TEXT    NOT NULL REFERENCES catalogo_cuentas(id_cuenta),
  detalle_linea   TEXT,
  tipo_movimiento TEXT    NOT NULL CHECK (tipo_movimiento IN ('D','H')),
  monto           REAL    NOT NULL CHECK (monto > 0)
);

-- ============================================================
-- SALDOS MENSUALES (resultado de la mayorización)
-- ============================================================
CREATE TABLE IF NOT EXISTS saldos_mensuales (
  id_compania          INTEGER NOT NULL,
  id_cuenta            TEXT    NOT NULL,
  ano                  INTEGER NOT NULL,
  mes                  INTEGER NOT NULL CHECK (mes BETWEEN 1 AND 12),
  saldo_anterior       REAL    NOT NULL DEFAULT 0,
  total_debitos_mes    REAL    NOT NULL DEFAULT 0,
  total_creditos_mes   REAL    NOT NULL DEFAULT 0,
  saldo_actual         REAL    NOT NULL DEFAULT 0,
  PRIMARY KEY (id_compania, id_cuenta, ano, mes),
  FOREIGN KEY (id_compania) REFERENCES companias(id_compania),
  FOREIGN KEY (id_cuenta)   REFERENCES catalogo_cuentas(id_cuenta)
);

CREATE INDEX IF NOT EXISTS idx_asientos_doc  ON asientos_detalle(id_documento);
CREATE INDEX IF NOT EXISTS idx_asientos_cta  ON asientos_detalle(id_cuenta);
CREATE INDEX IF NOT EXISTS idx_saldos_cuenta ON saldos_mensuales(id_compania, id_cuenta);

-- ============================================================
-- ESQUEMA LIMPIO EN CERO
-- ============================================================