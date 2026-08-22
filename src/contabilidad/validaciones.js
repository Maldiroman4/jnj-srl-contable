// Motor de validaciones contables.
// Pilar 1: jerarquía estricta (no hijos huérfanos).
// Pilar 2: herencia de la clase desde la cuenta mayor.
// Pilar 3: solo cuentas de desglose y balanceo estricto D = C.

const { db, tx } = require('../db');

// Pilar 1: validar que exista la cuenta mayor al crear/editar una cuenta.
// Plantilla de códigos: nivel1-level2-level3 -> ej. 110-01-001
function parseCodigo(codigo) {
  const limpio = String(codigo || '').replace(/[^0-9]/g, '');
  if (limpio.length !== 8) return null;
  return {
    id_cuenta: limpio,
    nivel1: limpio.slice(0, 3),
    nivel2: limpio.slice(3, 5),
    nivel3: limpio.slice(5, 8),
  };
}

function obtenerMayor(compania, nivel1) {
  return db.prepare(
    `SELECT * FROM catalogo_cuentas
     WHERE id_compania = ? AND nivel1 = ? AND nivel2 = '00' AND nivel3 = '000'`
  ).get(compania, nivel1);
}

function esMayor(nivel2, nivel3) {
  return nivel2 === '00' && nivel3 === '000';
}

// Pilar 2: clase SOLO se define en la cuenta mayor.
// El parámetro claseCuentaId se ignora si la cuenta no es mayor y se toma del padre.
function claseValidaPara({ id_compania, codigo, claseCuentaId }) {
  const pars = parseCodigo(codigo);
  if (!pars) return { ok: false, error: 'Código de cuenta inválido. Formato: XXX-XX-XXX' };

  if (esMayor(pars.nivel2, pars.nivel3)) {
    if (claseCuentaId == null) {
      return { ok: false, error: 'Debe indicar la clase de cuenta para la cuenta mayor.' };
    }
    return { ok: true, pars, clase: claseCuentaId };
  }

  const mayor = obtenerMayor(id_compania, pars.nivel1);
  if (!mayor) {
    return { ok: false, error: 'NO Posee Cuenta Mayor ... Presione Una Tecla' };
  }
  return { ok: true, pars, clase: mayor.clase_cuenta_id };
}

function cuentaTieneMovimiento(id_cuenta) {
  return !!db.prepare(
    'SELECT 1 FROM asientos_detalle WHERE id_cuenta = ? LIMIT 1'
  ).get(id_cuenta);
}

// ¿La cuenta (por nivel1/nivel2) posee descendientes?
function _tieneDescendientes(c) {
  if (c.nivel2 === '00' && c.nivel3 === '000') {
    // La cuenta mayor es desglose SOLO si no posee ninguna subcuenta.
    return !!db.prepare(
      `SELECT 1 FROM catalogo_cuentas
       WHERE id_compania = ? AND nivel1 = ? AND nivel2 != '00' LIMIT 1`
    ).get(c.id_compania, c.nivel1);
  }
  if (c.nivel3 === '000') {
    // La subcuenta es desglose SOLO si no posee cuentas de detalle.
    return !!db.prepare(
      `SELECT 1 FROM catalogo_cuentas
       WHERE id_compania = ? AND nivel1 = ? AND nivel2 = ? AND nivel3 != '000' LIMIT 1`
    ).get(c.id_compania, c.nivel1, c.nivel2);
  }
  // Nivel 3 (detalle) no tiene descendencia.
  return false;
}

function cuentaTieneHijos(id_cuenta) {
  const c = db.prepare('SELECT * FROM catalogo_cuentas WHERE id_cuenta = ?').get(id_cuenta);
  if (!c) return false;
  return _tieneDescendientes(c);
}

function marcarDesglose() {
  // Recalcula es_desglose: una cuenta deja de ser desglose si tiene hijos.
  const cuentas = db.prepare(
    'SELECT id_cuenta, id_compania, nivel1, nivel2, nivel3 FROM catalogo_cuentas'
  ).all();
  const setDesglose = db.prepare('UPDATE catalogo_cuentas SET es_desglose = ? WHERE id_cuenta = ?');
  tx(() => {
    for (const c of cuentas) {
      setDesglose.run(_tieneDescendientes(c) ? 0 : 1, c.id_cuenta);
    }
  });
}

// Pilar 2: propagar la clase de la cuenta mayor hacia toda su descendencia.
function propagarClase(compania, mayorIdCuenta, nuevaClase) {
  const prefijo = mayorIdCuenta.slice(0, 3);
  db.prepare(
    `UPDATE catalogo_cuentas SET clase_cuenta_id = ?
     WHERE id_compania = ? AND id_cuenta LIKE ?`
  ).run(nuevaClase, compania, prefijo + '%');
}

// Pilar 3: validar un asiento (encabezado + líneas).
function validarAsiento({ id_compania, lineas }) {
  if (!Array.isArray(lineas) || lineas.length === 0) {
    return { ok: false, error: 'El asiento debe tener al menos una línea.' };
  }

  let totalDebitos = 0;
  let totalCreditos = 0;

  for (const linea of lineas) {
    if (!linea.id_cuenta) {
      return { ok: false, error: 'Linea sin cuenta.' };
    }
    const cuenta = db.prepare(
      'SELECT * FROM catalogo_cuentas WHERE id_cuenta = ? AND id_compania = ?'
    ).get(linea.id_cuenta, id_compania);

    if (!cuenta) {
      return { ok: false, error: `Cuenta ${linea.id_cuenta} no existe en la compañía.` };
    }
    if (!cuenta.es_desglose) {
      return { ok: false, error: `${linea.id_cuenta} NO Es Cuenta de Desglose ... Presione Una Tecla` };
    }
    if (!['D', 'H'].includes(linea.tipo_movimiento)) {
      return { ok: false, error: 'Tipo de movimiento inválido (D o H).' };
    }
    const monto = Number(linea.monto);
    if (!(monto > 0)) {
      return { ok: false, error: 'El monto de la línea debe ser mayor a cero.' };
    }
    if (linea.tipo_movimiento === 'D') totalDebitos += monto;
    else totalCreditos += monto;
  }

  const diferencia = totalDebitos - totalCreditos;
  if (Math.abs(diferencia) > 0.005) {
    return {
      ok: false, error: 'Documento NO Balancea ... Presione Una Tecla',
      totalDebitos, totalCreditos, diferencia,
    };
  }
  return { ok: true, totalDebitos, totalCreditos };
}

module.exports = {
  parseCodigo,
  esMayor,
  obtenerMayor,
  claseValidaPara,
  marcarDesglose,
  propagarClase,
  cuentaTieneHijos,
  cuentaTieneMovimiento,
  validarAsiento,
};