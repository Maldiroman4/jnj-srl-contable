# Sistema Contable Integral

Reconstrucción moderna del sistema contable clásico **"SUPER JAZ / Compu-Jaz S.A."**.
Frontend en HTML/CSS/JavaScript puro, backend en Node.js (Express) y base de datos
SQLite (módulo nativo `node:sqlite`, sin dependencias extra).

## Requisitos

- **Node.js 24 o superior** (usa el módulo integrado `node:sqlite`).
- Navegador moderno (Chrome, Edge, Firefox).

## Instalación y ejecución

```bash
npm install
npm start
```

Abrir: **http://localhost:3000**

La base de datos `data/contabilidad.db` se crea automáticamente con:
- 2 compañías (24: *Inmobiliaria Zumbado Gomez S.A.*, 1: *Empresa de Prueba*).
- Plan de cuentas con máscara `XXX-XX-XXX` (Mayor → Subcuenta → Detalle).
- Asientos de ejemplo (aporte de capital, pago de electricidad con IVA, venta).

Para **reiniciar desde cero**, elimine la carpeta `data/` y reinicie el servidor.

## Funcionalidad (los 5 pilares del sistema original)

1. **Jerarquía estricta** del catálogo `XXX-XX-XXX`: no se puede crear una subcuenta o
   cuenta de detalle sin su Cuenta Mayor (`NO Posee Cuenta Mayor`).
2. **Herencia automática de clase**: la clase de cuenta se define solo en la Cuenta
   Mayor y toda la descendencia la hereda; si cambia en el mayor, se propaga.
3. **Asientos de partida doble**: solo cuentas de desglose (`NO Es Cuenta de Desglose`),
   con bloqueo si Débitos ≠ Créditos (`Documento NO Balancea`).
4. **Mayorización en cascada**: Detalle → Subcuenta → Mayor, y cierre mensual que
   arrastra el `saldo_actual` como `saldo_anterior` del siguiente período.
5. **Estados financieros**: Balance General (cuadra inyectando la utilidad/pérdida en
   el patrimonio), Estado de Resultados (Mes Anterior / Mes Actual / Acumulado), Reporte
   de Anexos ("La Biblia Contable") y **Libros Legales** (Libro Diario, Libro Mayor y
   Balance de Comprobación).
6. **Cierre fiscal**: cierre mensual con arrastre de saldos y **cierre anual** que emite
   el asiento de cierre (tipo 99, ceroea ingresos/egresos y concentra la utilidad/pérdida
   en la cuenta de resultados), dejando preparado el nuevo ejercicio.
7. **Exportar PDF / Imprimir**: todos los reportes se imprimen con formato de hoja
   contable (CSS print) con **membrete de la compañía** y pueden guardarse como PDF.
8. **Historial de Cuenta**: evolución mensual (saldo inicial, débitos, créditos y saldo
   final) de cualquier cuenta durante el ejercicio, con sus movimientos.
9. **Saldo Inicial / Apertura**: registro de saldos de arranque mediante un documento
    de apertura (Tipo 0) balanceado, que el Estado de Resultados ignora.
10. **Presupuesto vs Ejecutado**: cualquier cuenta puede marcarse como *presupuestada*
    (con su monto anual) desde el Catálogo; el reporte compara ese monto contra lo
    ejecutado en el año y la variación porcentual.
11. **Exportar CSV**: todos los reportes se exportan a `.csv` (abre en Excel con las
    tildes correctas mediante BOM UTF-8).
12. **Respaldo y Restauración**: la base se respalda físicamente (`data/backups/`) con
    un solo clic, se descarga y se puede restaurar desde un archivo `.db` (requiere
    reiniciar el servidor para aplicarla).
13. **Libro de IVA (Compras/Ventas)**: detecta automáticamente las cuentas de IVA del
    plan de cuentas ("IVA por Acreditar" y "IVA por Pagar") y genera el Libro de
    Compras, el Libro de Ventas y la Liquidación Mensual del IVA (débito − crédito =
    a pagar o a favor), incluyendo operaciones exentas.

## Estructura

```
SOFTWARE CONTABLES/
├── server.js              # Servidor Express (API + estáticos)
├── db/schema.sql          # Esquema SQLite + datos iniciales
├── src/                   # Backend
│   ├── db.js              # Conexión SQLite + transacciones anidadas
│   ├── contabilidad/
│   │   ├── validaciones.js# Motor de validaciones (pilares 1-3)
│   │   ├── mayorizacion.js# Mayorización y cierres (pilar 4)
│   │   └── reportes.js    # Balance, Resultados, Anexos (pilar 5)
│   └── routes/            # REST: companias, cuentas, asientos, procesos, reportes, backup
├── public/                # Frontend (HTML/CSS/JS sin frameworks)
│   ├── index.html
│   ├── css/styles.css
│   └── js/
│       ├── app.js         # SPA + enrutador de módulos
│       ├── api.js         # Cliente fetch de la API
│       ├── ui.js          # Máscaras, formatos, utilidades
│       └── modulos/       # companias, catalogo, asientos, procesos, reportes
└── docs/ARQUITECTURA.md   # Documento de arquitectura
```

## API principal

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET/POST | `/api/companias` | Listar / crear compañías |
| GET/POST/PUT/DELETE | `/api/cuentas` | Catálogo de cuentas con validaciones |
| GET/POST/DELETE | `/api/asientos` | Asientos contables |
| POST | `/api/procesos/mayorizacion` | Mayorizar período |
| POST | `/api/procesos/cierre-mensual` | Cierre mensual |
| GET | `/api/reportes/balance` | Balance General |
| GET | `/api/reportes/resultados` | Estado de Resultados |
| GET | `/api/reportes/anexos` | Reporte de Anexos |
| GET | `/api/reportes/diario` | Libro Diario |
| GET | `/api/reportes/mayor` | Libro Mayor |
| GET | `/api/reportes/comprobacion` | Balance de Comprobación |
| GET | `/api/reportes/historial` | Historial de Cuenta (`&cuenta=`) |
| GET | `/api/reportes/presupuesto` | Presupuesto vs Ejecutado |
| GET | `/api/reportes/iva` | Libro de IVA (Compras/Ventas) + Liquidación |
| POST | `/api/procesos/cierre-anual` | Cierre anual (emite asiento de cierre) |
| POST | `/api/backup/crear` | Crear respaldo físico de la base |
| GET | `/api/backup/listar` | Listar respaldos |
| GET | `/api/backup/descargar` | Descargar un respaldo (`?file=`) |
| POST | `/api/backup/restaurar` | Restaurar desde archivo `.db` subido |