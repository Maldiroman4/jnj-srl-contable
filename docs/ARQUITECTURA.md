# Sistema Contable Integral — Arquitectura

Reconstrucción moderna del sistema contable clásico **"SUPER JAZ / Compu-Jaz S.A."**
(FoxPro/xBase, MS-DOS) descrito en los videos de demostración, usando tecnología web.

## 1. Objetivo

Construir un **ERP Contable Multicompañía** que respete el rigor de la partida doble y
los 5 pilares funcionales del sistema original:

1. **Jerarquía estricta del catálogo** de cuentas `XXX-XX-XXX` (Mayor → Subcuenta → Detalle).
2. **Herencia automática de la clase de cuenta** desde la Cuenta Mayor a toda la descendencia.
3. **Asientos contables** solo sobre cuentas de desglose, con bloqueo si Débitos ≠ Créditos.
4. **Mayorización en cascada** (Detalle → Subcuenta → Mayor) y saldos mensuales.
5. **Estados financieros automáticos** (Balance General, Estado de Resultados, Anexos).

## 2. Stack Tecnológico

| Capa        | Tecnología                                   |
|-------------|----------------------------------------------|
| Frontend    | HTML5 + CSS3 + JavaScript puro (ES Modules)   |
| Backend     | Node.js + Express                            |
| Base de datos | SQLite (archivo `data/contabilidad.db`)     |
| Acceso a BD | `better-sqlite3` (síncrono, rápido, transaccional) |
| Reportes    | Generados en el navegador, imprimibles (CSS print) |

No se usa ningún framework JS: pantallas ágiles con teclado como el sistema original.

## 3. Estructura de Carpetas

```
SOFTWARE CONTABLES/
├── package.json
├── server.js                 # Servidor Express: API + estáticos
├── README.md
├── docs/
│   └── ARQUITECTURA.md       # Este documento
├── db/
│   └── schema.sql            # Esquema completo + datos iniciales
├── data/                     # Creada en tiempo de ejecución (contabilidad.db)
├── src/                      # Lógica backend
│   ├── db.js                 # Conexión SQLite + ejecución de schema
│   ├── contabilidad/
│   │   ├── validaciones.js   # Motor de validaciones (pilares 1, 2, 3)
│   │   ├── mayorizacion.js   # Mayorización en cascada y saldos (pilar 4)
│   │   └── reportes.js       # Balance, Resultados, Anexos (pilar 5)
│   └── routes/
│       ├── companias.js
│       ├── cuentas.js
│       ├── asientos.js
│       ├── procesos.js
│       └── reportes.js
└── public/                   # Frontend (estático)
    ├── index.html
    ├── css/
    │   └── styles.css        # Tema estilo consola clásica + moderno
    └── js/
        ├── app.js            # Enrutador de módulos (SPA)
        ├── api.js            # Cliente fetch de la API REST
        ├── ui.js             # Utilidades: máscaras, tablas, modales
        └── modulos/
            ├── companias.js  # Cambio de Compañía
            ├── catalogo.js   # Catálogo de Cuentas
            ├── asientos.js   # Asientos contables
            ├── procesos.js   # Mayorización y cierres
            └── reportes.js   # Estados financieros y anexos
```

## 4. Base de Datos

Motor: **SQLite** en modo WAL, transacciones atómicas para asientos y mayorización.

### Diagrama de tablas

```
companias
  id_compania PK, razon_social, cedula_juridica, mes_activo, ano_activo

clases_cuenta
  id_clase PK, nombre, signo, tipo_rubro  (tipo_rubro: ACTIVO/PASIVO/PATRIMONIO/INGRESO/EGRESO/ORDEN)

catalogo_cuentas
  id_cuenta PK (8 dígitos, sin guiones), id_compania FK,
  nivel1, nivel2, nivel3, descripcion, descripcion_ingles,
  clase_cuenta_id FK, es_cuenta_mayor, es_desglose,
  detalle1, detalle2, codigo_cabys, codigo_barras, presupuesta, monto_presupuestado

documentos_asientos
  id_documento PK, id_compania FK, tipo_documento, numero_documento,
  fecha, detalle_general, total_debitos, total_creditos

asientos_detalle
  id_linea PK, id_documento FK, id_cuenta FK, detalle_linea,
  tipo_movimiento ('D'/'H'), monto

saldos_mensuales
  id_compania FK, id_cuenta FK, ano, mes,
  saldo_anterior, total_debitos_mes, total_creditos_mes, saldo_actual
  PK (id_compania, id_cuenta, ano, mes)
```

### Reglas de negocio implementadas en BD

- `catalogo_cuentas.es_cuenta_mayor` = TRUE cuando `nivel2='00'` y `nivel3='000'`.
- `es_desglose` = TRUE cuando la cuenta **no** tiene hijos (último nivel).
- La clase solo se asigna en la Cuenta Mayor; se propaga a la descendencia.
- `asientos_detalle.tipo_movimiento` restringido a `'D'` o `'H'`.

## 5. API REST

| Método | Ruta                              | Descripción                                   |
|--------|-----------------------------------|-----------------------------------------------|
| GET    | /api/companias                    | Lista compañías                               |
| POST   | /api/companias                    | Crea compañía                                 |
| POST   | /api/companias/:id/activar        | Cambia compañía activa + período              |
| GET    | /api/cuentas?compania=ID          | Catálogo (con derivados de nivel/jerarquía)   |
| POST   | /api/cuentas                      | Crea cuenta (valida cuenta mayor existente)   |
| PUT    | /api/cuentas/:id                  | Edita cuenta (propaga clase a descendientes)  |
| DELETE | /api/cuentas/:id                  | Elimina cuenta (solo si no tiene movimiento)  |
| GET    | /api/asientos?compania=ID         | Lista asientos del período                    |
| POST   | /api/asientos                     | Crea asiento (valida desglose + balanceo)     |
| DELETE | /api/asientos/:id                 | Elimina asiento (y su mayorización asociada)  |
| POST   | /api/procesos/mayorizacion        | Mayoriza período (recálculo en cascada)       |
| GET    | /api/reportes/balance?compania&ano&mes | Balance General (con utilidad inyectada)  |
| GET    | /api/reportes/resultados?compania&ano&mes | Estado de Resultados                 |
| GET    | /api/reportes/anexos?compania&ano&mes    | Reporte de Anexos (historial por cuenta) |
| GET    | /api/reportes/catalogo?compania           | Catálogo de cuentas                  |

## 6. Motor de Validaciones (pilar 1–3)

Implementado en `src/contabilidad/validaciones.js`:

1. **Padre obligatorio** — Al crear nivel 2 o 3, debe existir la cuenta mayor; de lo
   contrario responde `NO Posee Cuenta Mayor`.
2. **Herencia de clase** — La clase se lee de la cuenta mayor; al editar la clase de un
   mayor se propaga a todos los descendientes (`UPDATE` recursivo en una transacción).
3. **Solo cuentas de desglose** — Un asiento rechaza cuentas con `es_desglose = FALSE`
   (`NO Es Cuenta de Desglose`).
4. **Balanceo exacto** — `total_debitos == total_creditos`; en caso contrario se bloquea
   el guardado (`Documento NO Balancea`).
5. **Integridad de cuentas** — No se puede eliminar una cuenta con hijos o con movimientos.

## 7. Mayorización en Cascada (pilar 4)

Rutina en `src/contabilidad/mayorizacion.js`, dentro de una transacción:

1. Se agrupan los detalles de asientos por `id_cuenta` (nivel 3) del período.
2. Se actualiza `saldos_mensuales` para las cuentas de detalle:
   `saldo_actual = saldo_anterior + debitos - creditos`.
3. En cascada se acumula hacia nivel 2 y nivel 1 sumando el saldo de sus hijos.
4. El cierre mensual convierte `saldo_actual` del mes en `saldo_anterior` del mes siguiente.

## 8. Estados Financieros (pilar 5)

Generados en `src/contabilidad/reportes.js` a partir de `saldos_mensuales`:

- **Estado de Resultados**: suma ingresos (clase 10/12/13/15) y egresos (11/16) por
  columnas Mes Anterior / Mes Actual / Acumulado; arroja la **Utilidad o Pérdida del período**.
- **Balance General**: agrupa por tipo de rubro (Activo, Pasivo, Patrimonio) según la clase;
  la utilidad del período se **inyecta en el Patrimonio** para que
  `Total Activo = Total Pasivo + Total Patrimonio`.
- **Reporte de Anexos**: por cuenta, saldo inicial, documentos que la afectaron (fecha,
  número, detalle, débito, crédito) y saldo final.

## 9. Frontend

SPA en `public/` con navegación por teclado:

- Menú principal con atajos de número (1..5).
- Máscara automática `___-__-___` en los campos de cuenta.
- Búsqueda predictiva de cuentas por código o descripción.
- En asientos, diferencia Débitos − Créditos en vivo, y bloqueo al guardar si no balancea.
- Reportes con formato de impresión (`@media print`).

## 10. Despliegue y Ejecución

```bash
npm install
npm start          # http://localhost:3000
```

La base de datos `data/contabilidad.db` se crea automáticamente con el esquema y los
datos iniciales (compañía de ejemplo y plan de cuentas básico).

## 11. Roadmap

- [x] Arquitectura y estructura del proyecto
- [ ] Esquema de BD con datos iniciales
- [ ] API de compañías, cuentas, asientos
- [ ] Motor de validaciones y mayorización
- [ ] Reportes (Balance, Resultados, Anexos)
- [ ] Interfaz de los 5 módulos
- [ ] Cierre mensual/anual y libros legales
