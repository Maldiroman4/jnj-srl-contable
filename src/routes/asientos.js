const express = require('express');
const { db, tx } = require('../db');
const { validarAsiento, validarFechaContable } = require('../contabilidad/validaciones');
const router = express.Router();

// GET /api/asientos - Listar documentos con filtro de período
router.get('/', (req, res) => {
  const compania = Number(req.query.compania);
  const ano = Number(req.query.ano);
  const mes = Number(req.query.mes);
  const estado = req.query.estado;

  let query = 'SELECT * FROM documentos_asientos WHERE id_compania = ?';
  const params = [compania];

  if (ano && mes) {
    const m = String(mes).padStart(2, '0');
    const a = String(ano).padStart(4, '0');
    query += ' AND substr(fecha, 1, 4) = ? AND substr(fecha, 6, 2) = ?';
    params.push(a, m);
  }

  if (estado) {
    query += ' AND estado = ?';
    params.push(estado);
  }

  query += ' ORDER BY fecha DESC, numero_documento DESC';

  const docs = db.prepare(query).all(...params);

  if (docs.length === 0) return res.json([]);

  const ids = docs.map(d => d.id_documento);
  const placeholders = ids.map(() => '?').join(',');

  const lineas = db.prepare(
    `SELECT a.*, c.descripcion AS cuenta_descripcion
     FROM asientos_detalle a 
     LEFT JOIN catalogo_cuentas c ON c.id_cuenta = a.id_cuenta AND c.id_compania = ?
     WHERE a.id_documento IN (${placeholders})
     ORDER BY a.id_documento, a.id_linea`
  ).all(compania, ...ids);

  const lineasPorDoc = new Map();
  for (const l of lineas) {
    if (!lineasPorDoc.has(l.id_documento)) lineasPorDoc.set(l.id_documento, []);
    lineasPorDoc.get(l.id_documento).push(l);
  }
  for (const d of docs) d.lineas = lineasPorDoc.get(d.id_documento) || [];

  res.json(docs);
});

// GET /api/asientos/buscar - Búsqueda reactiva por número de documento (RF-02)
router.get('/buscar', (req, res) => {
  const compania = Number(req.query.compania);
  const numero = (req.query.numero || '').trim();

  if (!compania || !numero) {
    return res.status(400).json({ error: 'Debe indicar compañía y número de documento.' });
  }

  const doc = db.prepare(
    `SELECT * FROM documentos_asientos 
     WHERE id_compania = ? AND (numero_documento = ? OR UPPER(numero_documento) = UPPER(?))`
  ).get(compania, numero, numero);

  if (!doc) {
    return res.json({ existe: false });
  }

  const lineas = db.prepare(
    `SELECT a.*, c.descripcion AS cuenta_descripcion
     FROM asientos_detalle a 
     LEFT JOIN catalogo_cuentas c ON c.id_cuenta = a.id_cuenta AND c.id_compania = ?
     WHERE a.id_documento = ?
     ORDER BY a.id_linea`
  ).all(compania, doc.id_documento);

  doc.lineas = lineas;
  res.json({ existe: true, documento: doc });
});

// GET /api/asientos/proximo - Sugerencia de próximo número correlativo
router.get('/proximo', (req, res) => {
  const compania = Number(req.query.compania);
  const prefijo = (req.query.prefijo || 'DI').trim().toUpperCase();

  const r = db.prepare(
    `SELECT numero_documento FROM documentos_asientos
     WHERE id_compania = ? AND numero_documento LIKE ?
     ORDER BY length(numero_documento) DESC, numero_documento DESC LIMIT 1`
  ).get(compania, `${prefijo}-%`);

  let secuencial = 1;
  if (r && r.numero_documento.includes('-')) {
    const parts = r.numero_documento.split('-');
    const num = parseInt(parts[parts.length - 1], 10);
    if (!isNaN(num)) secuencial = num + 1;
  }

  res.json({ numero: `${prefijo}-${String(secuencial).padStart(2, '0')}` });
});

// POST /api/asientos - Crear o actualizar documento contable (con validación de fecha y soporte borrador)
router.post('/', (req, res) => {
  const {
    id_compania,
    tipo_documento,
    numero_documento,
    fecha,
    detalle_general,
    lineas,
    guardar_borrador,
    sobrescribir
  } = req.body || {};

  if (!id_compania) return res.status(400).json({ error: 'Debe indicar la compañía.' });
  if (!numero_documento) return res.status(400).json({ error: 'Debe indicar el número de documento contable.' });

  // RF-01: Validación de Fecha Contable
  const vFecha = validarFechaContable({ id_compania, fecha });
  if (!vFecha.ok) return res.status(400).json(vFecha);

  // RF-04: Validación de Partidas (con soporte para borrador descuadrado)
  const esBorrador = Boolean(guardar_borrador);
  const v = validarAsiento({ id_compania, lineas, esBorrador });
  if (!v.ok) return res.status(400).json(v);

  const numDoc = numero_documento.trim();
  const dup = db.prepare(
    'SELECT id_documento, estado FROM documentos_asientos WHERE id_compania = ? AND numero_documento = ?'
  ).get(id_compania, numDoc);

  if (dup && !sobrescribir) {
    return res.status(409).json({
      error: `El documento ${numDoc} ya existe en el sistema.`,
      existe: true,
      id_documento: dup.id_documento
    });
  }

  const estadoFinal = v.es_borrador ? 'BORRADOR' : 'ASENTADO';
  const tipoDoc = tipo_documento ? String(tipo_documento).padStart(2, '0') : '01';

  let idDoc = dup ? dup.id_documento : null;

  try {
    tx(() => {
      if (dup) {
        // Actualizar documento existente y reescribir partidas
        db.prepare(
          `UPDATE documentos_asientos
           SET tipo_documento = ?, fecha = ?, detalle_general = ?,
               total_debitos = ?, total_creditos = ?, estado = ?
           WHERE id_documento = ?`
        ).run(tipoDoc, fecha, detalle_general || null, v.totalDebitos, v.totalCreditos, estadoFinal, idDoc);

        db.prepare('DELETE FROM asientos_detalle WHERE id_documento = ?').run(idDoc);
      } else {
        // Insertar nuevo documento contable
        const r = db.prepare(
          `INSERT INTO documentos_asientos
             (id_compania, tipo_documento, numero_documento, fecha, detalle_general, total_debitos, total_creditos, estado)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(id_compania, tipoDoc, numDoc, fecha, detalle_general || null,
              v.totalDebitos, v.totalCreditos, estadoFinal);
        idDoc = Number(r.lastInsertRowid);
      }

      const ins = db.prepare(
        'INSERT INTO asientos_detalle (id_documento, id_cuenta, detalle_linea, tipo_movimiento, monto) VALUES (?, ?, ?, ?, ?)'
      );
      for (const l of lineas) {
        ins.run(idDoc, l.id_cuenta, l.detalle_linea || null, l.tipo_movimiento, Number(l.monto));
      }
    });
  } catch (e) {
    return res.status(400).json({ error: 'No se pudo guardar el documento contable: ' + e.message });
  }

  res.status(dup ? 200 : 201).json({
    ok: true,
    id_documento: idDoc,
    numero_documento: numDoc,
    estado: estadoFinal,
    totalDebitos: v.totalDebitos,
    totalCreditos: v.totalCreditos,
    diferencia: v.diferencia
  });
});

// DELETE /api/asientos/:id - Eliminar documento contable
router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  tx(() => {
    db.prepare('DELETE FROM asientos_detalle WHERE id_documento = ?').run(id);
    db.prepare('DELETE FROM documentos_asientos WHERE id_documento = ?').run(id);
  });
  res.json({ ok: true });
});

module.exports = router;