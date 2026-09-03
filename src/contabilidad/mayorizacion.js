// Mayorización en cascada: Detalle -> Subcuenta -> Mayor.
// saldo_actual = saldo_anterior + débitos del mes - créditos del mes.

const { db, tx } = require('../db');

function mayorizar(compania, ano, mes) {
  const m = String(mes).padStart(2, '0');
  const a = String(ano).padStart(4, '0');

  db.prepare(
    'DELETE FROM saldos_mensuales WHERE id_compania = ? AND ano = ? AND mes = ?'
  ).run(compania, ano, mes);

  const cuentas = db.prepare(
    'SELECT id_cuenta, nivel1, nivel2, nivel3 FROM catalogo_cuentas WHERE id_compania = ?'
  ).all(compania);

  // Saldos del período inmediato anterior (para el "saldo anterior").
  const prevAno = mes === 1 ? ano - 1 : ano;
  const prevMes = mes === 1 ? 12 : mes - 1;
  const saldosPrev = new Map();
  for (const r of db.prepare(
    'SELECT id_cuenta, saldo_actual FROM saldos_mensuales WHERE id_compania = ? AND ano = ? AND mes = ?'
  ).all(compania, prevAno, prevMes)) {
    saldosPrev.set(r.id_cuenta, r.saldo_actual);
  }

  // Movimientos del mes por cuenta (débitos / créditos).
  const movD = new Map();
  const movC = new Map();
  for (const m2 of db.prepare(
    `SELECT a.id_cuenta, a.tipo_movimiento, SUM(a.monto) AS tot
     FROM asientos_detalle a
     JOIN documentos_asientos d ON d.id_documento = a.id_documento
     WHERE d.id_compania = ? AND substr(d.fecha, 1, 4) = ? AND substr(d.fecha, 6, 2) = ?
     GROUP BY a.id_cuenta, a.tipo_movimiento`
  ).all(compania, a, m)) {
    if (m2.tipo_movimiento === 'D') movD.set(m2.id_cuenta, m2.tot);
    else movC.set(m2.id_cuenta, m2.tot);
  }

  const rows = new Map();
  for (const c of cuentas) {
    rows.set(c.id_cuenta, {
      anterior: saldosPrev.get(c.id_cuenta) || 0,
      debit: movD.get(c.id_cuenta) || 0,
      credit: movC.get(c.id_cuenta) || 0,
    });
  }

  // 1) Cuentas de detalle: quedan con su propio movimiento.
  // 2) Subcuentas: acumulan sus cuentas de detalle.
  for (const p of cuentas.filter(c => c.nivel3 === '000' && c.nivel2 !== '00')) {
    for (const h of cuentas.filter(c => c.nivel1 === p.nivel1 && c.nivel2 === p.nivel2 && c.nivel3 !== '000')) {
      const rp = rows.get(p.id_cuenta);
      const rh = rows.get(h.id_cuenta);
      rp.debit += rh.debit;
      rp.credit += rh.credit;
    }
  }
  // 3) Cuentas mayores: acumulan sus subcuentas.
  for (const p of cuentas.filter(c => c.nivel2 === '00')) {
    for (const h of cuentas.filter(c => c.nivel1 === p.nivel1 && c.nivel2 !== '00' && c.nivel3 === '000')) {
      const rp = rows.get(p.id_cuenta);
      const rh = rows.get(h.id_cuenta);
      rp.debit += rh.debit;
      rp.credit += rh.credit;
    }
  }

  const insert = db.prepare(
    `INSERT OR REPLACE INTO saldos_mensuales
       (id_compania, id_cuenta, ano, mes, saldo_anterior, total_debitos_mes, total_creditos_mes, saldo_actual)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );
  tx(() => {
    for (const [idCuenta, r] of rows) {
      const actual = r.anterior + r.debit - r.credit;
      insert.run(compania, idCuenta, ano, mes, r.anterior, r.debit, r.credit, actual);
    }
  });

  return { compania, ano, mes, cuentas_procesadas: rows.size };
}

// Traspasa el saldo_actual de (origenAno, origenMes) al saldo_anterior de (destAno, destMes).
function traspasarSaldos(compania, origenAno, origenMes, destAno, destMes) {
  const upsert = db.prepare(
    `INSERT INTO saldos_mensuales
       (id_compania, id_cuenta, ano, mes, saldo_anterior, total_debitos_mes, total_creditos_mes, saldo_actual)
     VALUES (?, ?, ?, ?, ?, 0, 0, ?)
     ON CONFLICT(id_compania, id_cuenta, ano, mes)
     DO UPDATE SET saldo_anterior = excluded.saldo_anterior`
  );
  tx(() => {
    for (const r of db.prepare(
      'SELECT id_cuenta, saldo_actual FROM saldos_mensuales WHERE id_compania = ? AND ano = ? AND mes = ?'
    ).all(compania, origenAno, origenMes)) {
      upsert.run(compania, r.id_cuenta, destAno, destMes, r.saldo_actual, r.saldo_actual);
    }
  });
}

// Cierre mensual: traspasa el saldo_actual del mes al saldo_anterior del mes siguiente.
function cerrarMes(compania, ano, mes) {
  const res = mayorizar(compania, ano, mes);
  const nAno = mes === 12 ? ano + 1 : ano;
  const nMes = mes === 12 ? 1 : mes + 1;
  traspasarSaldos(compania, ano, mes, nAno, nMes);
  return { ...res, siguiente_periodo: `${nAno}-${String(nMes).padStart(2, '0')}` };
}

// Cierre anual con rutina de purga de cuentas inactivas con saldo cero para el nuevo período
function cerrarAnualConPurga(compania, ano, mes = 12) {
  const resMayorizacion = mayorizar(compania, ano, mes);

  // Asegurar tabla de archivo histórico para purgas
  db.exec(`
    CREATE TABLE IF NOT EXISTS catalogo_cuentas_purgadas (
      id_purga INTEGER PRIMARY KEY AUTOINCREMENT,
      id_cuenta TEXT NOT NULL,
      id_compania INTEGER NOT NULL,
      descripcion TEXT NOT NULL,
      ano_cierre INTEGER NOT NULL,
      fecha_purga TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );
  `);

  let purgadas = [];
  tx(() => {
    // 1) Identificar cuentas inactivas (activo = 0) con saldo cero en el cierre
    const candidatas = db.prepare(`
      SELECT c.id_cuenta, c.descripcion, c.nivel1, c.nivel2, c.nivel3,
             COALESCE((
               SELECT s.saldo_actual FROM saldos_mensuales s
               WHERE s.id_compania = c.id_compania AND s.id_cuenta = c.id_cuenta
                 AND s.ano = ? AND s.mes = ?
             ), 0) AS saldo
      FROM catalogo_cuentas c
      WHERE c.id_compania = ? AND c.activo = 0
    `).all(ano, mes, compania);

    // Filtrar aquellas con saldo cero y procesar de nivel más profundo (3) a más alto (1)
    const porPurgar = candidatas.filter(c => Math.abs(c.saldo) < 0.005);
    porPurgar.sort((a, b) => b.id_cuenta.localeCompare(a.id_cuenta));

    const insArchivo = db.prepare(`
      INSERT INTO catalogo_cuentas_purgadas (id_cuenta, id_compania, descripcion, ano_cierre)
      VALUES (?, ?, ?, ?)
    `);
    const delCuenta = db.prepare('DELETE FROM catalogo_cuentas WHERE id_cuenta = ? AND id_compania = ?');

    for (const c of porPurgar) {
      const tieneAsientos = db.prepare('SELECT 1 FROM asientos_detalle WHERE id_cuenta = ? LIMIT 1').get(c.id_cuenta);
      if (!tieneAsientos) {
        insArchivo.run(c.id_cuenta, compania, c.descripcion, ano);
        db.prepare('DELETE FROM saldos_mensuales WHERE id_cuenta = ? AND id_compania = ?').run(c.id_cuenta, compania);
        delCuenta.run(c.id_cuenta, compania);
        purgadas.push({ id_cuenta: c.id_cuenta, descripcion: c.descripcion });
      }
    }

    // 2) Traspasar saldos de balance al nuevo período (mes 1 del año siguiente)
    const nuevoAno = ano + 1;
    traspasarSaldos(compania, ano, mes, nuevoAno, 1);

    // 3) Actualizar período activo de la compañía
    db.prepare(`
      UPDATE companias SET ano_activo = ?, mes_activo = 1 WHERE id_compania = ?
    `).run(nuevoAno, compania);
  });

  return {
    ok: true,
    ano_cerrado: ano,
    nuevo_ano: ano + 1,
    cuentas_procesadas: resMayorizacion.cuentas_procesadas,
    cuentas_purgadas: purgadas.length,
    purgadas,
  };
}

module.exports = { mayorizar, cerrarMes, traspasarSaldos, cerrarAnualConPurga };