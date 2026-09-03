// Motor de validaciones contables.
// Pilar 1: jerarquía estricta (no hijos huérfanos).
// Pilar 2: herencia de la clase desde la cuenta mayor.
// Pilar 3: solo cuentas de desglose y balanceo estricto D = C.

const { db, tx } = require('../db');

// Pilar 1: jerarquía estricta (no hijos huérfanos)
// Plantilla de códigos:
// Nivel 1 (Mayor / Madre):   ej. 105 o 105-00-000 -> nivel1='105', nivel2='00', nivel3='000'
// Nivel 2 (Subcuenta / Hija): ej. 105-01 o 105-01-000 -> nivel1='105', nivel2='01', nivel3='000'
// Nivel 3 (Auxiliar / Nieta): ej. 105-01-001 -> nivel1='105', nivel2='01', nivel3='001'
function parseCodigo(codigo) {
  const limpio = String(codigo || '').replace(/[^0-9]/g, '');
  if (limpio.length === 3) {
    return {
      id_cuenta: limpio + '00000',
      nivel1: limpio,
      nivel2: '00',
      nivel3: '000',
      nivel: 1,
      formato: `${limpio}-00-000`
    };
  }
  if (limpio.length === 5) {
    return {
      id_cuenta: limpio + '000',
      nivel1: limpio.slice(0, 3),
      nivel2: limpio.slice(3, 5),
      nivel3: '000',
      nivel: 2,
      formato: `${limpio.slice(0, 3)}-${limpio.slice(3, 5)}-000`
    };
  }
  if (limpio.length === 8) {
    const n1 = limpio.slice(0, 3);
    const n2 = limpio.slice(3, 5);
    const n3 = limpio.slice(5, 8);
    const nivel = (n2 === '00' && n3 === '000') ? 1 : (n3 === '000' ? 2 : 3);
    return {
      id_cuenta: limpio,
      nivel1: n1,
      nivel2: n2,
      nivel3: n3,
      nivel,
      formato: `${n1}-${n2}-${n3}`
    };
  }
  return null;
}

function obtenerMayor(compania, nivel1) {
  return db.prepare(
    `SELECT * FROM catalogo_cuentas
     WHERE id_compania = ? AND nivel1 = ? AND nivel2 = '00' AND nivel3 = '000'`
  ).get(compania, nivel1);
}

function obtenerSubcuenta(compania, nivel1, nivel2) {
  return db.prepare(
    `SELECT * FROM catalogo_cuentas
     WHERE id_compania = ? AND nivel1 = ? AND nivel2 = ? AND nivel3 = '000'`
  ).get(compania, nivel1, nivel2);
}

function esMayor(nivel2, nivel3) {
  return nivel2 === '00' && nivel3 === '000';
}

// Pilar 1 & 2: Validación jerárquica estricta y herencia de rubro/clase
function claseValidaPara({ id_compania, codigo, claseCuentaId }) {
  const pars = parseCodigo(codigo);
  if (!pars) {
    return {
      ok: false,
      error: 'Código de cuenta inválido. Formato requerido: XXX, XXX-XX o XXX-XX-XXX (ej. 105, 105-01, 105-01-001).'
    };
  }

  // Nivel 1: Cuenta Mayor / Madre
  if (pars.nivel === 1) {
    if (claseCuentaId == null) {
      return { ok: false, error: 'Debe indicar la clase de cuenta para la cuenta mayor.' };
    }
    return { ok: true, pars, clase: claseCuentaId };
  }

  // Nivel 2: Subcuenta / Hija -> DEBE existir previamente el Nivel 1 (Mayor)
  if (pars.nivel === 2) {
    const mayor = obtenerMayor(id_compania, pars.nivel1);
    if (!mayor) {
      return {
        ok: false,
        error: `No se puede crear la subcuenta ${pars.nivel1}-${pars.nivel2} porque la cuenta mayor padre ${pars.nivel1} no existe en el catálogo de esta empresa.`
      };
    }
    return { ok: true, pars, clase: mayor.clase_cuenta_id };
  }

  // Nivel 3: Cuenta Auxiliar / Nieta -> DEBE existir Nivel 1 y Nivel 2 (Subcuenta)
  if (pars.nivel === 3) {
    const mayor = obtenerMayor(id_compania, pars.nivel1);
    if (!mayor) {
      return {
        ok: false,
        error: `No se puede crear la cuenta auxiliar ${pars.nivel1}-${pars.nivel2}-${pars.nivel3} porque la cuenta mayor padre ${pars.nivel1} no existe en el catálogo de esta empresa.`
      };
    }

    const subcuenta = obtenerSubcuenta(id_compania, pars.nivel1, pars.nivel2);
    if (!subcuenta) {
      return {
        ok: false,
        error: `No se puede crear la cuenta auxiliar ${pars.nivel1}-${pars.nivel2}-${pars.nivel3} porque la subcuenta padre ${pars.nivel1}-${pars.nivel2} no existe en el catálogo de esta empresa.`
      };
    }

    return { ok: true, pars, clase: subcuenta.clase_cuenta_id };
  }

  return { ok: false, error: 'Estructura de niveles contables no admitida.' };
}

function cuentaTieneMovimiento(id_cuenta) {
  return !!db.prepare(
    'SELECT 1 FROM asientos_detalle WHERE id_cuenta = ? LIMIT 1'
  ).get(id_cuenta);
}

function cuentaTieneSaldo(id_cuenta) {
  const s = db.prepare(
    'SELECT 1 FROM saldos_mensuales WHERE id_cuenta = ? AND ABS(saldo_actual) > 0.005 LIMIT 1'
  ).get(id_cuenta);
  return !!s;
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

// Pilar 2: propagar la clase de la cuenta mayor hacia toda su descendencia de forma atómica.
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
    if (cuenta.activo === 0) {
      return { ok: false, error: `La cuenta ${cuenta.id_cuenta} - ${cuenta.descripcion} está INACTIVA y no puede recibir nuevos asientos contables.` };
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
  obtenerSubcuenta,
  claseValidaPara,
  marcarDesglose,
  propagarClase,
  cuentaTieneHijos,
  cuentaTieneMovimiento,
  cuentaTieneSaldo,
  validarAsiento,
};