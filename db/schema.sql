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
-- COMPAÑÍAS
-- ============================================================
CREATE TABLE IF NOT EXISTS companias (
  id_compania       INTEGER PRIMARY KEY,
  razon_social      TEXT    NOT NULL,
  cedula_juridica   TEXT,
  mes_activo        INTEGER NOT NULL DEFAULT 1 CHECK (mes_activo BETWEEN 1 AND 12),
  ano_activo        INTEGER NOT NULL DEFAULT 2026
);

INSERT OR IGNORE INTO companias (id_compania, razon_social, cedula_juridica, mes_activo, ano_activo) VALUES
  (24, 'JNJ SRL', '3-101-000000', 8, 2026),
  (1,  'Empresa Demo',               '3-101-999999', 8, 2026);

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
-- DATOS INICIALES — Plan de cuentas empresa 24
-- ============================================================
INSERT OR IGNORE INTO catalogo_cuentas
  (id_cuenta, id_compania, nivel1, nivel2, nivel3, descripcion, descripcion_ingles,
   clase_cuenta_id, es_cuenta_mayor, es_desglose, detalle1)
VALUES
  -- ACTIVO CIRCULANTE
  ('11000000', 24, '110', '00', '000', 'Bancos', 'Banks', 1, 1, 0, NULL),
  ('11001000', 24, '110', '01', '000', 'Banco Promerica', 'Banco Promerica', 1, 0, 0, NULL),
  ('11001001', 24, '110', '01', '001', 'Cuenta Corriente', 'Checking Account', 1, 0, 1, 'Cuenta #30000001213276'),
  ('11200000', 24, '112', '00', '000', 'Banco Nacional', 'Banco Nacional', 1, 1, 0, NULL),
  ('11201000', 24, '112', '01', '000', 'Cuenta Corriente', 'Checking Account', 1, 0, 0, NULL),
  ('11201001', 24, '112', '01', '001', 'Cuenta Corriente CN', 'Checking Account CN', 1, 0, 1, 'Cuenta #CN-001'),
  -- CUENTAS POR COBRAR
  ('12000000', 24, '120', '00', '000', 'Cuentas por Cobrar', 'Accounts Receivable', 2, 1, 0, NULL),
  ('12001000', 24, '120', '01', '000', 'Clientes', 'Customers', 2, 0, 0, NULL),
  ('12001001', 24, '120', '01', '001', 'Clientes Nacionales', 'National Customers', 2, 0, 1, NULL),
  -- OTROS ACTIVOS
  ('16000000', 24, '160', '00', '000', 'Otros Activos', 'Other Assets', 4, 1, 0, NULL),
  ('16001000', 24, '160', '01', '000', 'Impuestos por Acreditar', 'Recoverable Taxes', 4, 0, 0, NULL),
  ('16001001', 24, '160', '01', '001', 'IVA por Acreditar', 'Input VAT', 4, 0, 1, NULL),
  -- ACTIVO FIJO
  ('13000000', 24, '130', '00', '000', 'Activo Fijo', 'Fixed Assets', 3, 1, 0, NULL),
  ('13001000', 24, '130', '01', '000', 'Mobiliario y Equipo', 'Furniture and Equipment', 3, 0, 0, NULL),
  ('13001001', 24, '130', '01', '001', 'Mobiliario', 'Furniture', 3, 0, 1, NULL),
  -- PASIVO CORTO PLAZO
  ('21000000', 24, '210', '00', '000', 'Pasivo Corto Plazo', 'Short Term Liabilities', 5, 1, 0, NULL),
  ('21001000', 24, '210', '01', '000', 'Proveedores', 'Suppliers', 5, 0, 0, NULL),
  ('21001001', 24, '210', '01', '001', 'Proveedores Nacionales', 'National Suppliers', 5, 0, 1, NULL),
  ('21002000', 24, '210', '02', '000', 'Impuestos por Pagar', 'Taxes Payable', 5, 0, 0, NULL),
  ('21002001', 24, '210', '02', '001', 'IVA 13% por Pagar', 'VAT 13% Payable', 5, 0, 1, NULL),
  -- PASIVO LARGO PLAZO
  ('23000000', 24, '230', '00', '000', 'Pasivo Largo Plazo', 'Long Term Liabilities', 7, 1, 0, NULL),
  ('23001000', 24, '230', '01', '000', 'Prestamos Bancarios', 'Bank Loans', 7, 0, 0, NULL),
  ('23001001', 24, '230', '01', '001', 'Prestamo Banco Promerica', 'Loan Banco Promerica', 7, 0, 1, NULL),
  -- CAPITAL CONTABLE
  ('28000000', 24, '280', '00', '000', 'Capital Contable', 'Equity', 8, 1, 0, NULL),
  ('28001000', 24, '280', '01', '000', 'Capital Social', 'Capital Stock', 8, 0, 0, NULL),
  ('28001001', 24, '280', '01', '001', 'Capital Social', 'Capital Stock', 8, 0, 1, NULL),
  ('28200000', 24, '282', '00', '000', 'Resultados del Ejercicio', 'Retained Earnings', 8, 1, 0, NULL),
  ('28201000', 24, '282', '01', '000', 'Utilidades o Perdidas', 'Profit or Loss', 8, 0, 0, NULL),
  ('28201001', 24, '282', '01', '001', 'Utilidades o Perdidas Acumuladas', 'Retained Profits', 8, 0, 1, NULL),
  -- COSTO DE VENTAS
  ('61000000', 24, '610', '00', '000', 'Costo de Ventas', 'Cost of Sales', 12, 1, 0, NULL),
  ('61001000', 24, '610', '01', '000', 'Costo de Mercaderia', 'Merchandise Cost', 12, 0, 0, NULL),
  ('61001001', 24, '610', '01', '001', 'Costo de Mercaderia', 'Merchandise Cost', 12, 0, 1, NULL),
  -- INGRESOS POR VENTAS
  ('50000000', 24, '500', '00', '000', 'Ingresos por Ventas', 'Sales Revenue', 13, 1, 0, NULL),
  ('50001000', 24, '500', '01', '000', 'Ventas de Mercaderia', 'Merchandise Sales', 13, 0, 0, NULL),
  ('50001001', 24, '500', '01', '001', 'Ventas de Mercaderia', 'Merchandise Sales', 13, 0, 1, NULL),
  ('50002000', 24, '500', '02', '000', 'Devoluciones y Rebajas', 'Returns and Allowances', 13, 0, 0, NULL),
  ('50002001', 24, '500', '02', '001', 'Devoluciones y Rebajas', 'Returns and Allowances', 13, 0, 1, NULL),
  -- EGRESOS
  ('60000000', 24, '600', '00', '000', 'Egresos', 'Expenses', 11, 1, 0, NULL),
  ('60001000', 24, '600', '01', '000', 'Gastos Administrativos', 'Administrative Expenses', 11, 0, 0, NULL),
  ('60001001', 24, '600', '01', '001', 'Salarios', 'Salaries', 11, 0, 1, NULL),
  ('60001002', 24, '600', '01', '002', 'Alquileres', 'Rent', 11, 0, 1, NULL),
  ('60001003', 24, '600', '01', '003', 'Papeleria y Utiles', 'Office Supplies', 11, 0, 1, NULL),
  ('60300000', 24, '603', '00', '000', 'Servicios Publicos', 'Public Services', 11, 1, 0, NULL),
  ('60301000', 24, '603', '01', '000', 'Agua', 'Water', 11, 0, 0, NULL),
  ('60301001', 24, '603', '01', '001', 'Agua', 'Water', 11, 0, 1, NULL),
  ('60302000', 24, '603', '02', '000', 'Electricidad', 'Electricity', 11, 0, 0, NULL),
  ('60302001', 24, '603', '02', '001', 'Electricidad', 'Electricity', 11, 0, 1, NULL),
  ('60303000', 24, '603', '03', '000', 'Telefono', 'Telephone', 11, 0, 0, NULL),
  ('60303001', 24, '603', '03', '001', 'Telefono', 'Telephone', 11, 0, 1, NULL);

-- Copia del plan de cuentas hacia la empresa 1 (para poder probar ambos)
INSERT OR IGNORE INTO catalogo_cuentas
  (id_cuenta, id_compania, nivel1, nivel2, nivel3, descripcion, descripcion_ingles,
   clase_cuenta_id, es_cuenta_mayor, es_desglose, detalle1)
SELECT id_cuenta, 1, nivel1, nivel2, nivel3, descripcion, descripcion_ingles,
       clase_cuenta_id, es_cuenta_mayor, es_desglose, detalle1
FROM catalogo_cuentas WHERE id_compania = 24;

-- ============================================================
-- ASIENTOS DE EJEMPLO (empresa 24, ago 2026)
-- ============================================================
INSERT OR IGNORE INTO documentos_asientos
  (id_documento, id_compania, tipo_documento, numero_documento, fecha, detalle_general, total_debitos, total_creditos)
VALUES
  (1, 24, 1, '2026-0001', '2026-08-01', 'Aporte inicial de capital social', 1000000.00, 1000000.00),
  (2, 24, 3, '2026-0002', '2026-08-05', 'Pago de electricidad con IVA (periodo julio)', 293800.00, 293800.00),
  (3, 24, 1, '2026-0003', '2026-08-10', 'Venta de mercaderia al contado', 113000.00, 113000.00);

INSERT OR IGNORE INTO asientos_detalle (id_documento, id_cuenta, detalle_linea, tipo_movimiento, monto) VALUES
  (1, '11001001', 'Aporte inicial a la cuenta corriente', 'D', 1000000.00),
  (1, '28001001', 'Capital social', 'H', 1000000.00),
  (2, '60302001', 'Servicio de electricidad julio', 'D', 260000.00),
  (2, '16001001', 'IVA 13%', 'D', 33800.00),
  (2, '11001001', 'Pago via Cuenta Corriente', 'H', 293800.00),
  (3, '11001001', 'Venta al contado', 'D', 113000.00),
  (3, '50001001', 'Venta de mercaderia', 'H', 100000.00),
  (3, '21002001', 'IVA 13% sobre venta', 'H', 13000.00);