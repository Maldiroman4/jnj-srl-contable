// Reportes financieros y libros legales con soporte de Rango de Fechas (Desde / Hasta)
const { db } = require('../db');
const { mayorizar, traspasarSaldos } = require('./mayorizacion');

const CLASES = () => {
  const m = new Map();
  for (const c of db.prepare('SELECT * FROM clases_cuenta').all()) m.set(c.id_clase, c);
  return m;
};

function resolverRango(ano, mes, desde, hasta) {
  let fDesde = desde;
  let fHasta = hasta;
  if (!fDesde || !fHasta) {
    const a = ano || new Date().getFullYear();
    const m = mes || (new Date().getMonth() + 1);
    const mStr = String(m).padStart(2, '0');
    const ultimoDia = new Date(a, m, 0).getDate();
    if (!fDesde) fDesde = `${a}-${mStr}-01`;
    if (!fHasta) fHasta = `${a}-${mStr}-${String(ultimoDia).padStart(2, '0')}`;
  }
  return {
    desde: fDesde,
    hasta: fHasta,
    ano: Number(fDesde.slice(0, 4)),
    mes: Number(fDesde.slice(5, 7))
  };
}

function asegurarSaldos(compania, ano, mes) {
  const r = db.prepare(
    'SELECT COUNT(*) AS n FROM saldos_mensuales WHERE id_compania = ? AND ano = ? AND mes = ?'
  ).get(compania, ano, mes);
  if (r.n === 0) mayorizar(compania, ano, mes);
}

function periodoAnterior(ano, mes) {
  return mes === 1 ? { ano: ano - 1, mes: 12 } : { ano, mes: mes - 1 };
}

// ---- Estado de Resultados (Por Rango de Fechas) -----------------------------
function estadoResultados(compania, ano, mes, desde, hasta) {
  const r = resolverRango(ano, mes, desde, hasta);

  const ingRango = db.prepare(
    `SELECT c.id_cuenta, c.descripcion,
            SUM(CASE WHEN a.tipo_movimiento = 'D' THEN a.monto ELSE 0 END) AS debitos,
            SUM(CASE WHEN a.tipo_movimiento = 'H' THEN a.monto ELSE 0 END) AS creditos
     FROM asientos_detalle a
     JOIN documentos_asientos d ON d.id_documento = a.id_documento
     JOIN catalogo_cuentas c ON c.id_cuenta = a.id_cuenta AND c.id_compania = d.id_compania
     JOIN clases_cuenta cl ON cl.id_clase = c.clase_cuenta_id
     WHERE d.id_compania = ? AND d.tipo_documento NOT IN (0, 99)
       AND d.fecha >= ? AND d.fecha <= ?
       AND cl.tipo_rubro = 'INGRESO' AND c.es_desglose = 1
     GROUP BY c.id_cuenta, c.descripcion`
  ).all(compania, r.desde, r.hasta);

  const egrRango = db.prepare(
    `SELECT c.id_cuenta, c.descripcion,
            SUM(CASE WHEN a.tipo_movimiento = 'D' THEN a.monto ELSE 0 END) AS debitos,
            SUM(CASE WHEN a.tipo_movimiento = 'H' THEN a.monto ELSE 0 END) AS creditos
     FROM asientos_detalle a
     JOIN documentos_asientos d ON d.id_documento = a.id_documento
     JOIN catalogo_cuentas c ON c.id_cuenta = a.id_cuenta AND c.id_compania = d.id_compania
     JOIN clases_cuenta cl ON cl.id_clase = c.clase_cuenta_id
     WHERE d.id_compania = ? AND d.tipo_documento NOT IN (0, 99)
       AND d.fecha >= ? AND d.fecha <= ?
       AND cl.tipo_rubro = 'EGRESO' AND c.es_desglose = 1
     GROUP BY c.id_cuenta, c.descripcion`
  ).all(compania, r.desde, r.hasta);

  const filas = [];
  let totIng = 0;
  let totEgr = 0;

  for (const item of ingRango) {
    const neto = item.creditos - item.debitos;
    totIng += neto;
    filas.push({ apartado: 'INGRESOS', id_cuenta: item.id_cuenta, descripcion: item.descripcion, anterior: 0, actual: neto, acumulado: neto });
  }

  for (const item of egrRango) {
    const neto = item.debitos - item.creditos;
    totEgr += neto;
    filas.push({ apartado: 'EGRESOS', id_cuenta: item.id_cuenta, descripcion: item.descripcion, anterior: 0, actual: neto, acumulado: neto });
  }

  const utilidad = totIng - totEgr;

  return {
    periodo: { ano: r.ano, mes: r.mes, desde: r.desde, hasta: r.hasta },
    filas,
    total_ingresos: { anterior: 0, actual: totIng, acumulado: totIng },
    total_egresos: { anterior: 0, actual: totEgr, acumulado: totEgr },
    utilidad: { anterior: 0, actual: utilidad, acumulado: utilidad },
  };
}

// ---- Balance General (Acumulado a la fecha 'hasta') -----------------------
function balanceGeneral(compania, ano, mes, desde, hasta) {
  const r = resolverRango(ano, mes, desde, hasta);

  const cuentas = db.prepare(
    `SELECT c.id_cuenta, c.descripcion, c.clase_cuenta_id, cl.tipo_rubro
     FROM catalogo_cuentas c JOIN clases_cuenta cl ON cl.id_clase = c.clase_cuenta_id
     WHERE c.id_compania = ? AND c.nivel2 = '00' AND c.nivel3 = '000'`
  ).all(compania);

  const saldosHijas = db.prepare(
    `SELECT substr(c.id_cuenta, 1, 1) || '0000000' AS id_padre,
            SUM(CASE WHEN a.tipo_movimiento = 'D' THEN a.monto ELSE -a.monto END) AS saldo
     FROM catalogo_cuentas c
     JOIN asientos_detalle a ON a.id_cuenta = c.id_cuenta
     JOIN documentos_asientos d ON d.id_documento = a.id_documento AND d.id_compania = c.id_compania
     WHERE c.id_compania = ? AND d.fecha <= ?
     GROUP BY id_padre`
  ).all(compania, r.hasta);
  const mapPadres = new Map(saldosHijas.map(x => [x.id_padre, x.saldo || 0]));

  const activo = [], pasivo = [], patrimonio = [];
  for (const c of cuentas) {
    const saldo = mapPadres.get(c.id_cuenta) || 0;
    const item = { id_cuenta: c.id_cuenta, descripcion: c.descripcion, saldo };
    if (c.tipo_rubro === 'ACTIVO') activo.push(item);
    else if (c.tipo_rubro === 'PASIVO') pasivo.push({ ...item, saldo: -saldo });
    else if (c.tipo_rubro === 'PATRIMONIO') patrimonio.push({ ...item, saldo: -saldo });
  }

  const totalActivo = activo.reduce((a, b) => a + b.saldo, 0);
  const totalPasivo = pasivo.reduce((a, b) => a + b.saldo, 0);
  const totalPatrimonioBase = patrimonio.reduce((a, b) => a + b.saldo, 0);

  const res = estadoResultados(compania, r.ano, r.mes, r.desde, r.hasta);
  const utilidad = res.utilidad.acumulado;
  const totalPatrimonio = totalPatrimonioBase + utilidad;

  return {
    periodo: { ano: r.ano, mes: r.mes, desde: r.desde, hasta: r.hasta },
    activo, pasivo, patrimonio,
    total_activo: totalActivo,
    total_pasivo: totalPasivo,
    total_patrimonio: totalPatrimonio,
    utilidad_periodo: utilidad,
    cuadra: Math.abs(totalActivo - (totalPasivo + totalPatrimonio)) < 0.01,
  };
}

// ---- Reporte de Anexos (Por Rango de Fechas) ------------------------------
function anexos(compania, ano, mes, desde, hasta) {
  const r = resolverRango(ano, mes, desde, hasta);
  const reporte = [];
  const saldos = db.prepare(
    `SELECT c.id_cuenta, c.descripcion FROM catalogo_cuentas c
     WHERE c.id_compania = ? AND c.es_desglose = 1
     ORDER BY c.id_cuenta`
  ).all(compania);

  const previos = new Map(
    db.prepare(
      `SELECT a.id_cuenta,
              SUM(CASE WHEN a.tipo_movimiento = 'D' THEN a.monto ELSE -a.monto END) AS saldo_previo
       FROM asientos_detalle a
       JOIN documentos_asientos d ON d.id_documento = a.id_documento
       WHERE d.id_compania = ? AND d.fecha < ?
       GROUP BY a.id_cuenta`
    ).all(compania, r.desde).map(x => [x.id_cuenta, x.saldo_previo || 0])
  );

  const movs = db.prepare(
    `SELECT a.id_cuenta, a.detalle_linea, a.tipo_movimiento, a.monto,
            d.numero_documento, d.fecha, d.detalle_general
     FROM asientos_detalle a
     JOIN documentos_asientos d ON d.id_documento = a.id_documento
     WHERE d.id_compania = ? AND d.fecha >= ? AND d.fecha <= ?
     ORDER BY d.fecha, a.id_cuenta`
  ).all(compania, r.desde, r.hasta);

  const movsPorCuenta = new Map();
  for (const mv of movs) {
    if (!movsPorCuenta.has(mv.id_cuenta)) movsPorCuenta.set(mv.id_cuenta, []);
    movsPorCuenta.get(mv.id_cuenta).push(mv);
  }

  for (const s of saldos) {
    const items = movsPorCuenta.get(s.id_cuenta) || [];
    const ini = previos.get(s.id_cuenta) || 0;
    let corrido = ini;
    const mArray = items.map(x => {
      if (x.tipo_movimiento === 'D') corrido += x.monto;
      else corrido -= x.monto;
      return {
        fecha: x.fecha, numero: x.numero_documento,
        detalle: x.detalle_linea || x.detalle_general,
        debito: x.tipo_movimiento === 'D' ? x.monto : 0,
        credito: x.tipo_movimiento === 'H' ? x.monto : 0,
      };
    });
    if (items.length === 0 && Math.abs(ini) < 0.005 && Math.abs(corrido) < 0.005) continue;
    reporte.push({
      id_cuenta: s.id_cuenta,
      descripcion: s.descripcion,
      saldo_inicial: ini,
      movimientos: mArray,
      saldo_final: corrido,
    });
  }
  return { periodo: { ano: r.ano, mes: r.mes, desde: r.desde, hasta: r.hasta }, cuentas: reporte };
}

// ---- Catálogo de cuentas --------------------------------------------------
function catalogo(compania) {
  return db.prepare(
    `SELECT c.*, cl.nombre AS clase_nombre, cl.tipo_rubro
     FROM catalogo_cuentas c JOIN clases_cuenta cl ON cl.id_clase = c.clase_cuenta_id
     WHERE c.id_compania = ? ORDER BY c.id_cuenta`
  ).all(compania);
}

// ---- Libro Diario (Por Rango de Fechas) ------------------------------------
function libroDiario(compania, ano, mes, desde, hasta) {
  const r = resolverRango(ano, mes, desde, hasta);
  const docs = db.prepare(
    `SELECT * FROM documentos_asientos
     WHERE id_compania = ? AND fecha >= ? AND fecha <= ?
     ORDER BY fecha, id_documento`
  ).all(compania, r.desde, r.hasta);

  const lineas = db.prepare(
    `SELECT a.*, c.descripcion AS cuenta_descripcion
     FROM asientos_detalle a JOIN catalogo_cuentas c ON c.id_cuenta = a.id_cuenta
     ORDER BY a.id_documento, a.id_linea`
  ).all();
  const porDoc = new Map();
  for (const l of lineas) {
    if (!porDoc.has(l.id_documento)) porDoc.set(l.id_documento, []);
    porDoc.get(l.id_documento).push(l);
  }
  for (const d of docs) d.lineas = porDoc.get(d.id_documento) || [];
  return { periodo: { ano: r.ano, mes: r.mes, desde: r.desde, hasta: r.hasta }, documentos: docs };
}

// ---- Libro Mayor (Por Rango de Fechas con Saldo Corrido) -------------------
function libroMayor(compania, ano, mes, desde, hasta) {
  const r = resolverRango(ano, mes, desde, hasta);

  const saldosPrevios = db.prepare(
    `SELECT a.id_cuenta,
            SUM(CASE WHEN a.tipo_movimiento = 'D' THEN a.monto ELSE -a.monto END) AS saldo_previo
     FROM asientos_detalle a
     JOIN documentos_asientos d ON d.id_documento = a.id_documento
     WHERE d.id_compania = ? AND d.fecha < ?
     GROUP BY a.id_cuenta`
  ).all(compania, r.desde);
  const mapInicial = new Map(saldosPrevios.map(x => [x.id_cuenta, x.saldo_previo || 0]));

  const movs = db.prepare(
    `SELECT a.id_cuenta, c.descripcion, a.detalle_linea, a.tipo_movimiento, a.monto,
            d.numero_documento, d.fecha
     FROM asientos_detalle a
     JOIN documentos_asientos d ON d.id_documento = a.id_documento
     JOIN catalogo_cuentas c ON c.id_cuenta = a.id_cuenta
     WHERE d.id_compania = ? AND d.fecha >= ? AND d.fecha <= ?
     ORDER BY a.id_cuenta, d.fecha, d.id_documento`
  ).all(compania, r.desde, r.hasta);

  const cuentas = [];
  const porCuenta = new Map();
  for (const mv of movs) {
    if (!porCuenta.has(mv.id_cuenta)) {
      porCuenta.set(mv.id_cuenta, []);
      cuentas.push({ id_cuenta: mv.id_cuenta, descripcion: mv.descripcion });
    }
    porCuenta.get(mv.id_cuenta).push(mv);
  }

  for (const c of cuentas) {
    const ini = mapInicial.get(c.id_cuenta) || 0;
    c.saldo_inicial = ini;
    let corrido = ini;
    c.movimientos = porCuenta.get(c.id_cuenta).map(x => {
      if (x.tipo_movimiento === 'D') corrido += x.monto;
      else corrido -= x.monto;
      return {
        fecha: x.fecha, numero: x.numero_documento, detalle: x.detalle_linea,
        debito: x.tipo_movimiento === 'D' ? x.monto : 0,
        credito: x.tipo_movimiento === 'H' ? x.monto : 0,
        saldo: corrido,
      };
    });
    c.saldo_final = corrido;
  }
  return { periodo: { ano: r.ano, mes: r.mes, desde: r.desde, hasta: r.hasta }, cuentas };
}

// ---- Balance de Comprobación (Por Rango de Fechas) -------------------------
function balanceComprobacion(compania, ano, mes, desde, hasta) {
  const r = resolverRango(ano, mes, desde, hasta);
  const catalogo = db.prepare(
    `SELECT c.id_cuenta, c.descripcion
     FROM catalogo_cuentas c
     WHERE c.id_compania = ? AND c.es_desglose = 1
     ORDER BY c.id_cuenta`
  ).all(compania);

  const previos = new Map(
    db.prepare(
      `SELECT a.id_cuenta,
              SUM(CASE WHEN a.tipo_movimiento = 'D' THEN a.monto ELSE -a.monto END) AS saldo_previo
       FROM asientos_detalle a
       JOIN documentos_asientos d ON d.id_documento = a.id_documento
       WHERE d.id_compania = ? AND d.fecha < ?
       GROUP BY a.id_cuenta`
    ).all(compania, r.desde).map(x => [x.id_cuenta, x.saldo_previo || 0])
  );

  const rango = new Map(
    db.prepare(
      `SELECT a.id_cuenta,
              SUM(CASE WHEN a.tipo_movimiento = 'D' THEN a.monto ELSE 0 END) AS debitos,
              SUM(CASE WHEN a.tipo_movimiento = 'H' THEN a.monto ELSE 0 END) AS creditos
       FROM asientos_detalle a
       JOIN documentos_asientos d ON d.id_documento = a.id_documento
       WHERE d.id_compania = ? AND d.fecha >= ? AND d.fecha <= ?
       GROUP BY a.id_cuenta`
    ).all(compania, r.desde, r.hasta).map(x => [x.id_cuenta, x])
  );

  const cuentas = [];
  for (const c of catalogo) {
    const ini = previos.get(c.id_cuenta) || 0;
    const mov = rango.get(c.id_cuenta) || { debitos: 0, creditos: 0 };
    const fin = ini + mov.debitos - mov.creditos;
    if (Math.abs(ini) < 0.005 && Math.abs(mov.debitos) < 0.005 && Math.abs(mov.creditos) < 0.005 && Math.abs(fin) < 0.005) {
      continue;
    }
    cuentas.push({
      id_cuenta: c.id_cuenta,
      descripcion: c.descripcion,
      saldo_anterior: ini,
      debitos: mov.debitos,
      creditos: mov.creditos,
      saldo_actual: fin,
      deudor: fin >= 0 ? fin : 0,
      acreedor: fin < 0 ? -fin : 0
    });
  }

  const totales = cuentas.reduce((t, c) => ({
    debitos: t.debitos + c.debitos,
    creditos: t.creditos + c.creditos,
    deudor: t.deudor + c.deudor,
    acreedor: t.acreedor + c.acreedor,
  }), { debitos: 0, creditos: 0, deudor: 0, acreedor: 0 });

  totales.cuadra = Math.abs(totales.debitos - totales.creditos) < 0.01
    && Math.abs(totales.deudor - totales.acreedor) < 0.01;

  return { periodo: { ano: r.ano, mes: r.mes, desde: r.desde, hasta: r.hasta }, cuentas, totales };
}

// ---- Historial de Cuenta --------------------------------------------------
function historialCuenta(compania, ano, mes, idCuenta, desde, hasta) {
  const r = resolverRango(ano, mes, desde, hasta);
  const cuenta = db.prepare(
    'SELECT * FROM catalogo_cuentas WHERE id_compania = ? AND id_cuenta = ?'
  ).get(compania, idCuenta);
  if (!cuenta) return { error: 'Cuenta no encontrada.' };

  const prev = db.prepare(
    `SELECT SUM(CASE WHEN a.tipo_movimiento = 'D' THEN a.monto ELSE -a.monto END) AS saldo_previo
     FROM asientos_detalle a
     JOIN documentos_asientos d ON d.id_documento = a.id_documento
     WHERE d.id_compania = ? AND a.id_cuenta = ? AND d.fecha < ?`
  ).get(compania, idCuenta, r.desde);
  const saldoInicial = (prev && prev.saldo_previo) || 0;

  const movimientos = db.prepare(
    `SELECT d.fecha, d.numero_documento, a.detalle_linea, a.tipo_movimiento, a.monto, d.detalle_general
     FROM asientos_detalle a
     JOIN documentos_asientos d ON d.id_documento = a.id_documento
     WHERE d.id_compania = ? AND a.id_cuenta = ?
       AND d.fecha >= ? AND d.fecha <= ?
     ORDER BY d.fecha, d.id_documento`
  ).all(compania, idCuenta, r.desde, r.hasta);

  let corrido = saldoInicial;
  const filas = movimientos.map(x => {
    if (x.tipo_movimiento === 'D') corrido += x.monto;
    else corrido -= x.monto;
    return {
      fecha: x.fecha,
      numero: x.numero_documento,
      detalle: x.detalle_linea || x.detalle_general,
      debito: x.tipo_movimiento === 'D' ? x.monto : 0,
      credito: x.tipo_movimiento === 'H' ? x.monto : 0,
      saldo: corrido
    };
  });

  return {
    periodo: { ano: r.ano, mes: r.mes, desde: r.desde, hasta: r.hasta },
    cuenta,
    saldo_inicial: saldoInicial,
    movimientos: filas,
    saldo_final: corrido
  };
}

// ---- Presupuesto ----------------------------------------------------------
function presupuesto(compania, ano, mes, desde, hasta) {
  const r = resolverRango(ano, mes, desde, hasta);
  const filas = db.prepare(
    `SELECT c.id_cuenta, c.descripcion, cl.tipo_rubro,
            IFNULL(p.monto_presupuestado, 0) AS monto_presupuestado
     FROM catalogo_cuentas c
     JOIN clases_cuenta cl ON cl.id_clase = c.clase_cuenta_id
     LEFT JOIN presupuestos p ON p.id_cuenta = c.id_cuenta AND p.id_compania = c.id_compania AND p.ano = ? AND p.mes = ?
     WHERE c.id_compania = ? AND c.es_desglose = 1 AND cl.tipo_rubro IN ('INGRESO', 'EGRESO')
     ORDER BY c.id_cuenta`
  ).all(r.ano, r.mes, compania);

  const movs = new Map(
    db.prepare(
      `SELECT a.id_cuenta,
              SUM(CASE WHEN a.tipo_movimiento = 'D' THEN a.monto ELSE 0 END) AS debitos,
              SUM(CASE WHEN a.tipo_movimiento = 'H' THEN a.monto ELSE 0 END) AS creditos
       FROM asientos_detalle a
       JOIN documentos_asientos d ON d.id_documento = a.id_documento
       WHERE d.id_compania = ? AND d.fecha >= ? AND d.fecha <= ?
       GROUP BY a.id_cuenta`
    ).all(compania, r.desde, r.hasta).map(x => [x.id_cuenta, x])
  );

  let totPresupuesto = 0, totEjecutado = 0;
  const resultado = [];

  for (const fila of filas) {
    const mv = movs.get(fila.id_cuenta) || { debitos: 0, creditos: 0 };
    const ejecutado = fila.tipo_rubro === 'INGRESO' ? mv.creditos - mv.debitos : mv.debitos - mv.creditos;
    const monto = fila.monto_presupuestado || 0;
    const variacion_pct = monto > 0.005 ? (ejecutado - monto) / monto * 100 : 0;
    totPresupuesto += monto;
    totEjecutado += Math.abs(ejecutado) > 0.005 ? ejecutado : 0;

    resultado.push({
      id_cuenta: fila.id_cuenta,
      descripcion: fila.descripcion,
      tipo_rubro: fila.tipo_rubro,
      monto_presupuestado: monto,
      ejecutado,
      variacion_pct,
    });
  }

  return {
    periodo: { ano: r.ano, mes: r.mes, desde: r.desde, hasta: r.hasta },
    filas: resultado,
    totales: { presupuesto: totPresupuesto, ejecutado: totEjecutado },
  };
}

// ---- Libro de IVA (Compras / Ventas) ---------------------------------------
function libroIVA(compania, ano, mes, desde, hasta) {
  const r = resolverRango(ano, mes, desde, hasta);

  const ivaCuentas = db.prepare(
    `SELECT c.id_cuenta, cl.tipo_rubro
     FROM catalogo_cuentas c JOIN clases_cuenta cl ON cl.id_clase = c.clase_cuenta_id
     WHERE c.id_compania = ?
       AND (c.descripcion LIKE '%IVA%' OR c.descripcion_ingles LIKE '%VAT%')`
  ).all(compania);
  const ctasEntrada = new Set(ivaCuentas.filter(c => c.tipo_rubro === 'ACTIVO').map(c => c.id_cuenta));
  const ctasSalida = new Set(ivaCuentas.filter(c => c.tipo_rubro === 'PASIVO').map(c => c.id_cuenta));
  const esIVA = (id) => ctasEntrada.has(id) || ctasSalida.has(id);

  const docs = db.prepare(
    `SELECT * FROM documentos_asientos
     WHERE id_compania = ? AND tipo_documento NOT IN (0, 99)
       AND fecha >= ? AND fecha <= ?
     ORDER BY fecha, numero_documento`
  ).all(compania, r.desde, r.hasta);

  const lineasDe = db.prepare(
    `SELECT a.*, c.clase_cuenta_id, cl.tipo_rubro
     FROM asientos_detalle a
     JOIN catalogo_cuentas c ON c.id_cuenta = a.id_cuenta
     JOIN clases_cuenta cl ON cl.id_clase = c.clase_cuenta_id
     WHERE a.id_documento = ?`
  );

  const compras = [], ventas = [];
  let totBaseC = 0, totIvaC = 0, totBaseV = 0, totIvaV = 0;

  for (const d of docs) {
    const lineas = lineasDe.all(d.id_documento);
    let ivaEntradaD = 0, ivaSalidaH = 0, ingresoH = 0, egresoD = 0;
    for (const l of lineas) {
      if (ctasEntrada.has(l.id_cuenta) && l.tipo_movimiento === 'D') ivaEntradaD += l.monto;
      if (ctasSalida.has(l.id_cuenta) && l.tipo_movimiento === 'H') ivaSalidaH += l.monto;
      if (!esIVA(l.id_cuenta) && l.tipo_rubro === 'INGRESO' && l.tipo_movimiento === 'H') ingresoH += l.monto;
      if (!esIVA(l.id_cuenta) && l.tipo_rubro === 'EGRESO' && l.tipo_movimiento === 'D') egresoD += l.monto;
    }

    let tipo, base, iva;
    if (ivaEntradaD > 0.005) {
      tipo = 'C'; base = d.total_creditos - ivaEntradaD; iva = ivaEntradaD;
    } else if (ivaSalidaH > 0.005) {
      tipo = 'V'; base = d.total_creditos - ivaSalidaH; iva = ivaSalidaH;
    } else if (egresoD > 0.005) {
      tipo = 'C'; base = egresoD; iva = 0;
    } else if (ingresoH > 0.005) {
      tipo = 'V'; base = ingresoH; iva = 0;
    } else continue;

    const fila = {
      id_documento: d.id_documento,
      numero: d.numero_documento,
      fecha: d.fecha,
      detalle: d.detalle_general || '',
      base: Math.round(base * 100) / 100,
      iva: Math.round(iva * 100) / 100,
      total: Math.round((base + iva) * 100) / 100,
    };
    if (tipo === 'C') { compras.push(fila); totBaseC += fila.base; totIvaC += fila.iva; }
    else { ventas.push(fila); totBaseV += fila.base; totIvaV += fila.iva; }
  }

  return {
    periodo: { ano: r.ano, mes: r.mes, desde: r.desde, hasta: r.hasta },
    cuentas: {
      entrada: [...ctasEntrada],
      salida: [...ctasSalida],
    },
    compras: { filas: compras, totales: { base: totBaseC, iva: totIvaC, total: totBaseC + totIvaC } },
    ventas: { filas: ventas, totales: { base: totBaseV, iva: totIvaV, total: totBaseV + totIvaV } },
    liquidacion: {
      iva_debito: totIvaV,
      iva_credito: totIvaC,
      iva_a_pagar: Math.round((totIvaV - totIvaC) * 100) / 100,
    },
  };
}

module.exports = {
  estadoResultados, balanceGeneral, anexos, catalogo, asegurarSaldos,
  libroDiario, libroMayor, balanceComprobacion,
  historialCuenta, presupuesto, libroIVA,
};