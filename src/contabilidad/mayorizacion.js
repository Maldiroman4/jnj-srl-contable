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

module.exports = { mayorizar, cerrarMes, traspasarSaldos };