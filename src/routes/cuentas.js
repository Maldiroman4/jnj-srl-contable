const express = require('express');
const { db, tx } = require('../db');
const {
  parseCodigo, esMayor, claseValidaPara, marcarDesglose, propagarClase,
  cuentaTieneHijos, cuentaTieneMovimiento, cuentaTieneSaldo,
} = require('../contabilidad/validaciones');
const router = express.Router();

const REC = db.prepare(
  `SELECT c.*, cl.nombre AS clase_nombre, cl.tipo_rubro
   FROM catalogo_cuentas c JOIN clases_cuenta cl ON cl.id_clase = c.clase_cuenta_id
   WHERE c.id_cuenta = ?`
);

// Endpoint de verificación dinámica previa (Lookup & Upsert asistido)
router.get('/lookup', (req, res) => {
  const id_compania = Number(req.query.compania || req.query.id_compania);
  const codigo = String(req.query.codigo || '').trim();
  if (!id_compania || !codigo) {
    return res.status(400).json({ error: 'Compañía y código son requeridos.' });
  }
  const p = parseCodigo(codigo);
  if (!p) {
    return res.status(400).json({ error: 'Formato de código inválido.' });
  }

  const cuenta = db.prepare(`
    SELECT c.*, cl.nombre AS clase_nombre, cl.tipo_rubro
    FROM catalogo_cuentas c
    JOIN clases_cuenta cl ON cl.id_clase = c.clase_cuenta_id
    WHERE c.id_compania = ? AND c.id_cuenta = ?
  `).get(id_compania, p.id_cuenta);

  if (!cuenta) {
    let padre = null;
    if (p.nivel === 2) {
      padre = db.prepare(`
        SELECT c.id_cuenta, c.descripcion, c.clase_cuenta_id, cl.nombre AS clase_nombre
        FROM catalogo_cuentas c JOIN clases_cuenta cl ON cl.id_clase = c.clase_cuenta_id
        WHERE c.id_compania = ? AND c.nivel1 = ? AND c.nivel2 = '00' AND c.nivel3 = '000'
      `).get(id_compania, p.nivel1);
    } else if (p.nivel === 3) {
      padre = db.prepare(`
        SELECT c.id_cuenta, c.descripcion, c.clase_cuenta_id, cl.nombre AS clase_nombre
        FROM catalogo_cuentas c JOIN clases_cuenta cl ON cl.id_clase = c.clase_cuenta_id
        WHERE c.id_compania = ? AND c.nivel1 = ? AND c.nivel2 = ? AND c.nivel3 = '000'
      `).get(id_compania, p.nivel1, p.nivel2);
    }

    return res.json({
      existe: false,
      codigo_parseado: p,
      padre_directo: padre || null,
    });
  }

  const tiene_movimientos = cuentaTieneMovimiento(cuenta.id_cuenta);
  const tiene_saldo = cuentaTieneSaldo(cuenta.id_cuenta);
  const tiene_hijos = cuentaTieneHijos(cuenta.id_cuenta);
  const saldoRow = db.prepare(`
    SELECT saldo_actual FROM saldos_mensuales
    WHERE id_compania = ? AND id_cuenta = ?
    ORDER BY ano DESC, mes DESC LIMIT 1
  `).get(id_compania, cuenta.id_cuenta);

  res.json({
    existe: true,
    cuenta: {
      ...cuenta,
      codigo_formateado: `${cuenta.nivel1}-${cuenta.nivel2}-${cuenta.nivel3}`,
    },
    tiene_movimientos,
    tiene_saldo,
    tiene_hijos,
    saldo_actual: saldoRow ? saldoRow.saldo_actual : 0,
    puede_eliminar_fisicamente: !tiene_movimientos && !tiene_saldo && !tiene_hijos,
  });
});

// Exportación estructurada a Excel / CSV con jerarquía indentada
router.get('/export/excel', (req, res) => {
  const compania = Number(req.query.compania);
  if (!compania) return res.status(400).json({ error: 'Compañía requerida.' });

  const cia = db.prepare('SELECT * FROM companias WHERE id_compania = ?').get(compania);
  const rows = db.prepare(`
    SELECT c.*, cl.nombre AS clase_nombre, cl.tipo_rubro
    FROM catalogo_cuentas c JOIN clases_cuenta cl ON cl.id_clase = c.clase_cuenta_id
    WHERE c.id_compania = ? AND c.nivel1 != '999'
    ORDER BY c.id_cuenta
  `).all(compania);

  let csv = '\uFEFF'; // BOM UTF-8
  csv += `CATÁLOGO GENERAL DE CUENTAS - ${cia ? cia.razon_social : 'COMPAÑÍA ' + compania}\r\n`;
  csv += `Generado el: ${new Date().toLocaleString('es-CR')}\r\n\r\n`;
  csv += `Código;Nivel;Descripción;Clase Contable;Tipo Rubro;Estado;Es Desglose\r\n`;

  for (const r of rows) {
    const codFmt = `${r.nivel1}-${r.nivel2}-${r.nivel3}`;
    let nivel = 1;
    let indent = '';
    if (r.nivel2 !== '00' && r.nivel3 === '000') { nivel = 2; indent = '   '; }
    else if (r.nivel3 !== '000') { nivel = 3; indent = '      '; }

    const estadoStr = r.activo === 1 ? 'ACTIVA' : 'INACTIVA';
    const desgloseStr = r.es_desglose === 1 ? 'SÍ' : 'NO';
    csv += `"${codFmt}";"${nivel}";"${indent}${r.descripcion.replace(/"/g, '""')}";"${r.clase_nombre}";"${r.tipo_rubro}";"${estadoStr}";"${desgloseStr}"\r\n`;
  }

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="catalogo_cuentas_${compania}.csv"`);
  res.send(csv);
});

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
          clase_cuenta_id, es_cuenta_mayor, es_desglose, activo, detalle1, detalle2,
          codigo_cabys, codigo_barras, presupuesta, monto_presupuestado)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 1, ?, ?, ?, ?, ?, ?)`
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

  const { descripcion, descripcion_ingles, clase_cuenta_id, activo, detalle1, detalle2,
          codigo_cabys, codigo_barras, presupuesta, monto_presupuestado } = req.body || {};

  tx(() => {
    db.prepare(
      `UPDATE catalogo_cuentas SET
         descripcion = COALESCE(?, descripcion),
         descripcion_ingles = COALESCE(?, descripcion_ingles),
         activo = COALESCE(?, activo),
         detalle1 = COALESCE(?, detalle1), detalle2 = COALESCE(?, detalle2),
         codigo_cabys = COALESCE(?, codigo_cabys), codigo_barras = COALESCE(?, codigo_barras),
         presupuesta = COALESCE(?, presupuesta),
         monto_presupuestado = COALESCE(?, monto_presupuestado)
       WHERE id_cuenta = ?`
    ).run(descripcion || null, descripcion_ingles || null,
          activo == null ? null : (activo ? 1 : 0),
          detalle1 || null, detalle2 || null,
          codigo_cabys || null, codigo_barras || null,
          presupuesta == null ? null : (presupuesta ? 1 : 0),
          monto_presupuestado == null ? null : monto_presupuestado, id);

    // Propagación en cascada atómica si es cuenta mayor y cambia la clase
    if (clase_cuenta_id && cuenta.es_cuenta_mayor && Number(clase_cuenta_id) !== cuenta.clase_cuenta_id) {
      propagarClase(cuenta.id_compania, id, Number(clase_cuenta_id));
    }
    marcarDesglose();
  });

  res.json(REC.get(id));
});

// Soft Delete / Toggle Activo
router.patch('/:id/toggle-activo', (req, res) => {
  const id = req.params.id;
  const cuenta = REC.get(id);
  if (!cuenta) return res.status(404).json({ error: 'Cuenta no encontrada.' });

  const nuevoEstado = cuenta.activo === 1 ? 0 : 1;
  tx(() => {
    db.prepare('UPDATE catalogo_cuentas SET activo = ? WHERE id_cuenta = ?').run(nuevoEstado, id);
    if (nuevoEstado === 0 && cuenta.nivel2 === '00' && cuenta.nivel3 === '000') {
      db.prepare('UPDATE catalogo_cuentas SET activo = 0 WHERE id_compania = ? AND nivel1 = ?')
        .run(cuenta.id_compania, cuenta.nivel1);
    } else if (nuevoEstado === 0 && cuenta.nivel3 === '000') {
      db.prepare('UPDATE catalogo_cuentas SET activo = 0 WHERE id_compania = ? AND nivel1 = ? AND nivel2 = ?')
        .run(cuenta.id_compania, cuenta.nivel1, cuenta.nivel2);
    }
  });

  res.json({
    ok: true,
    id_cuenta: id,
    activo: nuevoEstado,
    mensaje: nuevoEstado === 1 ? 'Cuenta activada exitosamente.' : 'Cuenta desactivada lógicamente (Soft Delete).'
  });
});

// Hard Delete Protection
router.delete('/:id', (req, res) => {
  const id = req.params.id;
  const cuenta = REC.get(id);
  if (!cuenta) return res.status(404).json({ error: 'Cuenta no encontrada.' });

  if (cuentaTieneHijos(id)) {
    return res.status(400).json({ error: 'La cuenta posee subcuentas subordinadas. No se puede eliminar.' });
  }
  if (cuentaTieneMovimiento(id)) {
    return res.status(400).json({
      error: 'PROTECCIÓN DE INTEGRIDAD: La cuenta posee registros en el historial de asientos (journal entry lines). Está prohibida su eliminación física. Utilice la desactivación lógica (Soft Delete).'
    });
  }
  if (cuentaTieneSaldo(id)) {
    return res.status(400).json({
      error: 'PROTECCIÓN DE INTEGRIDAD: La cuenta posee saldo actual activo en el ejercicio contable. Está prohibida su eliminación física.'
    });
  }

  tx(() => {
    db.prepare('DELETE FROM catalogo_cuentas WHERE id_cuenta = ?').run(id);
    marcarDesglose();
  });
  res.json({ ok: true, mensaje: 'Cuenta eliminada físicamente.' });
});

module.exports = router;