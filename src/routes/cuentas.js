const express = require('express');
const { db, tx } = require('../db');
const {
  parseCodigo, esMayor, claseValidaPara, marcarDesglose, propagarClase,
  cuentaTieneHijos, cuentaTieneMovimiento,
} = require('../contabilidad/validaciones');
const router = express.Router();

const REC = db.prepare(
  `SELECT c.*, cl.nombre AS clase_nombre, cl.tipo_rubro
   FROM catalogo_cuentas c JOIN clases_cuenta cl ON cl.id_clase = c.clase_cuenta_id
   WHERE c.id_cuenta = ?`
);

router.get('/', (req, res) => {
  const compania = Number(req.query.compania);
  const includeInternals = req.query.include_internals === 'true' || req.query.include_internals === '1';

  let sql = `
    SELECT c.*, cl.nombre AS clase_nombre, cl.tipo_rubro,
           (SELECT COUNT(*) FROM asientos_detalle a WHERE a.id_cuenta = c.id_cuenta) AS movimientos
    FROM catalogo_cuentas c JOIN clases_cuenta cl ON cl.id_clase = c.clase_cuenta_id
    WHERE c.id_compania = ?
  `;

  if (!includeInternals) {
    sql += ` AND c.nivel1 != '999' `;
  }

  sql += ` ORDER BY c.id_cuenta `;

  const rows = db.prepare(sql).all(compania);
  const formatted = rows.map(r => ({
    ...r,
    codigo_formateado: `${r.nivel1}-${r.nivel2}-${r.nivel3}`
  }));

  res.json(formatted);
});

router.get('/clases', (req, res) => {
  res.json(db.prepare('SELECT * FROM clases_cuenta ORDER BY id_clase').all());
});

router.post('/', (req, res) => {
  let b;
  try { b = req.body; } catch { b = {}; }
  const { id_compania, codigo, descripcion, descripcion_ingles, clase_cuenta_id,
          detalle1, detalle2, codigo_cabys, codigo_barras, presupuesta, monto_presupuestado } = b || {};

  if (!id_compania) {
    return res.status(400).json({ error: 'Debe especificar la compañía activa.' });
  }

  const v = claseValidaPara({ id_compania: Number(id_compania), codigo, claseCuentaId: clase_cuenta_id });
  if (!v.ok) return res.status(400).json({ error: v.error });
  if (!descripcion) return res.status(400).json({ error: 'Debe indicar la descripción de la cuenta.' });

  const existe = db.prepare('SELECT id_cuenta FROM catalogo_cuentas WHERE id_cuenta = ? AND id_compania = ?')
    .get(v.pars.id_cuenta, Number(id_compania));
  if (existe) {
    return res.status(400).json({ error: `La cuenta ${v.pars.formato || v.pars.id_cuenta} ya existe en el catálogo de esta empresa.` });
  }

  const esMayorBool = esMayor(v.pars.nivel2, v.pars.nivel3) ? 1 : 0;
  tx(() => {
    db.prepare(
      `INSERT INTO catalogo_cuentas
         (id_cuenta, id_compania, nivel1, nivel2, nivel3, descripcion, descripcion_ingles,
          clase_cuenta_id, es_cuenta_mayor, es_desglose, detalle1, detalle2,
          codigo_cabys, codigo_barras, presupuesta, monto_presupuestado)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?)`
    ).run(v.pars.id_cuenta, Number(id_compania), v.pars.nivel1, v.pars.nivel2, v.pars.nivel3,
          descripcion, descripcion_ingles || null, v.clase,
          esMayorBool, detalle1 || null, detalle2 || null,
          codigo_cabys || null, codigo_barras || null, presupuesta ? 1 : 0, monto_presupuestado || 0);
    marcarDesglose();
  });

  const creada = REC.get(v.pars.id_cuenta);
  res.status(201).json({
    ...creada,
    codigo_formateado: `${creada.nivel1}-${creada.nivel2}-${creada.nivel3}`
  });
});

router.put('/:id', (req, res) => {
  const id = req.params.id;
  const cuenta = REC.get(id);
  if (!cuenta) return res.status(404).json({ error: 'Cuenta no encontrada.' });

  const { descripcion, descripcion_ingles, clase_cuenta_id, detalle1, detalle2,
          codigo_cabys, codigo_barras, presupuesta, monto_presupuestado } = req.body || {};

  tx(() => {
    db.prepare(
      `UPDATE catalogo_cuentas SET
         descripcion = COALESCE(?, descripcion),
         descripcion_ingles = COALESCE(?, descripcion_ingles),
         detalle1 = COALESCE(?, detalle1), detalle2 = COALESCE(?, detalle2),
         codigo_cabys = COALESCE(?, codigo_cabys), codigo_barras = COALESCE(?, codigo_barras),
         presupuesta = COALESCE(?, presupuesta),
         monto_presupuestado = COALESCE(?, monto_presupuestado)
       WHERE id_cuenta = ?`
    ).run(descripcion || null, descripcion_ingles || null, detalle1 || null, detalle2 || null,
          codigo_cabys || null, codigo_barras || null,
          presupuesta == null ? null : (presupuesta ? 1 : 0),
          monto_presupuestado == null ? null : monto_presupuestado, id);

    // Pilar 2: si se modifica la clase de una cuenta mayor, se propaga a toda la descendencia.
    if (clase_cuenta_id && cuenta.es_cuenta_mayor && Number(clase_cuenta_id) !== cuenta.clase_cuenta_id) {
      propagarClase(cuenta.id_compania, id, Number(clase_cuenta_id));
    }
    marcarDesglose();
  });

  res.json(REC.get(id));
});

router.delete('/:id', (req, res) => {
  const id = req.params.id;
  const cuenta = REC.get(id);
  if (!cuenta) return res.status(404).json({ error: 'Cuenta no encontrada.' });
  if (cuentaTieneHijos(id)) return res.status(400).json({ error: 'La cuenta posee subcuentas. No se puede eliminar.' });
  if (cuentaTieneMovimiento(id)) return res.status(400).json({ error: 'La cuenta posee movimientos contables. No se puede eliminar.' });

  tx(() => {
    db.prepare('DELETE FROM catalogo_cuentas WHERE id_cuenta = ?').run(id);
    marcarDesglose();
  });
  res.json({ ok: true });
});

module.exports = router;