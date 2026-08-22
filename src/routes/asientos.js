const express = require('express');
const { db, tx } = require('../db');
const { validarAsiento } = require('../contabilidad/validaciones');
const router = express.Router();

router.get('/', (req, res) => {
  const compania = Number(req.query.compania);
  const ano = Number(req.query.ano);
  const mes = Number(req.query.mes);

  let docs;
  if (ano && mes) {
    const m = String(mes).padStart(2, '0');
    const a = String(ano).padStart(4, '0');
    docs = db.prepare(
      `SELECT * FROM documentos_asientos
       WHERE id_compania = ? AND substr(fecha, 1, 4) = ? AND substr(fecha, 6, 2) = ?
       ORDER BY numero_documento`
    ).all(compania, a, m);
  } else {
    docs = db.prepare('SELECT * FROM documentos_asientos WHERE id_compania = ? ORDER BY numero_documento').all(compania);
  }

  const lineas = db.prepare(
    `SELECT a.*, c.descripcion AS cuenta_descripcion
     FROM asientos_detalle a JOIN catalogo_cuentas c ON c.id_cuenta = a.id_cuenta
     ORDER BY a.id_documento, a.id_linea`
  ).all();

  const lineasPorDoc = new Map();
  for (const l of lineas) {
    if (!lineasPorDoc.has(l.id_documento)) lineasPorDoc.set(l.id_documento, []);
    lineasPorDoc.get(l.id_documento).push(l);
  }
  for (const d of docs) d.lineas = lineasPorDoc.get(d.id_documento) || [];

  res.json(docs);
});

router.get('/proximo', (req, res) => {
  const compania = Number(req.query.compania);
  const ano = Number(req.query.ano) || new Date().getFullYear();
  const r = db.prepare(
    `SELECT numero_documento FROM documentos_asientos
     WHERE id_compania = ? AND numero_documento LIKE ?
     ORDER BY numero_documento DESC LIMIT 1`
  ).get(compania, `${ano}-%`);
  const secuencial = r && r.numero_documento.includes('-')
    ? Number(r.numero_documento.split('-').pop()) + 1
    : 1;
  res.json({ numero: `${ano}-${String(secuencial).padStart(4, '0')}` });
});

router.post('/', (req, res) => {
  const { id_compania, tipo_documento, numero_documento, fecha, detalle_general, lineas } = req.body || {};

  if (!id_compania) return res.status(400).json({ error: 'Debe indicar la compañía.' });
  if (!numero_documento) return res.status(400).json({ error: 'Debe indicar el número de documento.' });

  const v = validarAsiento({ id_compania, lineas });
  if (!v.ok) return res.status(400).json(v);

  const dup = db.prepare('SELECT id_documento FROM documentos_asientos WHERE id_compania = ? AND numero_documento = ?')
    .get(id_compania, numero_documento);
  if (dup) return res.status(400).json({ error: `El documento ${numero_documento} ya existe.` });

  try {
    tx(() => {
      const r = db.prepare(
        `INSERT INTO documentos_asientos
           (id_compania, tipo_documento, numero_documento, fecha, detalle_general, total_debitos, total_creditos)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(id_compania, tipo_documento || 1, numero_documento, fecha, detalle_general || null,
            v.totalDebitos, v.totalCreditos);
      const idDoc = Number(r.lastInsertRowid);

      const ins = db.prepare(
        'INSERT INTO asientos_detalle (id_documento, id_cuenta, detalle_linea, tipo_movimiento, monto) VALUES (?, ?, ?, ?, ?)'
      );
      for (const l of lineas) ins.run(idDoc, l.id_cuenta, l.detalle_linea || null, l.tipo_movimiento, l.monto);
    });
  } catch (e) {
    return res.status(400).json({ error: 'No se pudo guardar el documento: ' + e.message });
  }
  res.status(201).json({ ok: true });
});

router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  tx(() => {
    db.prepare('DELETE FROM asientos_detalle WHERE id_documento = ?').run(id);
    db.prepare('DELETE FROM documentos_asientos WHERE id_documento = ?').run(id);
  });
  res.json({ ok: true });
});

module.exports = router;