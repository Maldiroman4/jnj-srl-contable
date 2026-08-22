import { getEstado } from '../app.js';
import { registrarModulo } from '../registro.js';
import { el, elFragment, mensaje, fmtCodigo, fmtMoneda, paginaHeader, cargando } from '../ui.js';
import { GET } from '../api.js';
import { exportarElementoAPDF } from '../pdf-export.js';

export function render() {
  const e = getEstado();
  const contenido = document.getElementById('app-contenido');
  contenido.innerHTML = '';

  contenido.appendChild(paginaHeader('Reportes Contables & Financieros',
    'Estados financieros, libros legales, balances, IVA y exportaciones por rango de fechas.',
    `JNJ SRL · COMPAÑÍA ${e.compania}`));

  const hoy = new Date().toISOString().split('T')[0];
  const primerDia = `${hoy.slice(0, 7)}-01`;

  const panel = el(`
    <div class="panel">
      <h2>Generador de reportes por Rango de Fechas</h2>
      <div class="toolbar no-print" style="display:flex; align-items:center; flex-wrap:wrap; gap:10px; margin-top:12px;">
        <select id="r-tipo" style="padding:8px 12px; border-radius:6px; border:1px solid #cbd5e1; font-weight:600;">
          <optgroup label="Estados Financieros">
            <option value="balance">Balance General</option>
            <option value="resultados">Estado de Resultados</option>
          </optgroup>
          <optgroup label="Libros Legales">
            <option value="diario">Libro Diario</option>
            <option value="mayor">Libro Mayor</option>
            <option value="comprobacion">Balance de Comprobación</option>
          </optgroup>
          <optgroup label="Otros">
            <option value="anexos">Reporte de Anexos</option>
            <option value="historial">Historial de Cuenta</option>
            <option value="presupuesto">Presupuesto vs Ejecutado</option>
            <option value="iva">Libro de IVA (Compras/Ventas)</option>
            <option value="catalogo">Catálogo de Cuentas</option>
          </optgroup>
        </select>

        <div style="display:flex; align-items:center; gap:6px; background:#f8fafc; padding:4px 10px; border-radius:6px; border:1px solid #e2e8f0;">
          <span style="font-size:12px; font-weight:700; color:#475569;">Desde:</span>
          <input id="r-desde" type="date" value="${primerDia}" style="padding:4px 8px; border-radius:6px; border:1px solid #cbd5e1; font-weight:600; font-family:var(--mono);">
        </div>

        <div style="display:flex; align-items:center; gap:6px; background:#f8fafc; padding:4px 10px; border-radius:6px; border:1px solid #e2e8f0;">
          <span style="font-size:12px; font-weight:700; color:#475569;">Hasta:</span>
          <input id="r-hasta" type="date" value="${hoy}" style="padding:4px 8px; border-radius:6px; border:1px solid #cbd5e1; font-weight:600; font-family:var(--mono);">
        </div>

        <input id="r-cuenta" list="dl-historial" placeholder="Cuenta (historial)" class="cuenta"
               style="width:150px; display:none; padding:8px;" maxlength="11">
        <datalist id="dl-historial"></datalist>

        <button class="btn btn-primary" id="r-ver" style="padding:8px 16px; font-weight:700;">🔍 Generar Reporte</button>
        <button class="btn btn-gris" id="r-pdf" style="padding:8px 16px; font-weight:700;">📥 Descargar PDF</button>
        <button class="btn btn-gris" id="r-csv" style="padding:8px 16px;">Exportar CSV</button>
      </div>
      <div id="r-salida" class="reporte" style="margin-top:16px;"></div>
    </div>`);
  contenido.appendChild(panel);

  panel.querySelector('#r-ver').addEventListener('click', () => generar(panel));
  panel.querySelector('#r-pdf').addEventListener('click', async () => {
    const nombre = panel.querySelector('#r-tipo').value;
    const desde = panel.querySelector('#r-desde').value;
    const hasta = panel.querySelector('#r-hasta').value;
    const btn = panel.querySelector('#r-pdf');
    const orig = btn.textContent;
    btn.textContent = '⏳ Generando PDF...';
    btn.disabled = true;
    try {
      await exportarElementoAPDF(panel.querySelector('#r-salida'), {
        nombreArchivo: `Reporte_${nombre}_del_${desde}_al_${hasta}.pdf`
      });
    } finally {
      btn.textContent = orig;
      btn.disabled = false;
    }
  });
  panel.querySelector('#r-csv').addEventListener('click', () => exportarCSV(panel));

  // Selector de cuenta para el historial (muestra/oculta el campo).
  panel.querySelector('#r-tipo').addEventListener('change', () => {
    panel.querySelector('#r-cuenta').style.display =
      panel.querySelector('#r-tipo').value === 'historial' ? '' : 'none';
  });

  GET(`/api/cuentas?compania=${e.compania}`).then(cuentas => {
    const dl = panel.querySelector('#dl-historial');
    dl.innerHTML = cuentas.map(c =>
      `<option value="${fmtCodigo(c.id_cuenta)}">${c.descripcion}</option>`).join('');
  }).catch(() => {});

  generar(panel);
}

async function obtenerEmpresa() {
  const e = getEstado();
  const listas = await GET('/api/companias');
  return listas.find(c => c.id_compania === e.compania) || {};
}

async function generar(panel) {
  const e = getEstado();
  const tipo = panel.querySelector('#r-tipo').value;
  const desde = panel.querySelector('#r-desde').value;
  const hasta = panel.querySelector('#r-hasta').value;
  const salida = panel.querySelector('#r-salida');
  salida.innerHTML = '';
  salida.appendChild(cargando('Generando reporte por fechas...'));

  try {
    let url = `/api/reportes/${tipo}?compania=${e.compania}&desde=${desde}&hasta=${hasta}`;
    if (tipo === 'historial') {
      const cuenta = (panel.querySelector('#r-cuenta').value || '').replace(/\D/g, '');
      if (!cuenta) {
        salida.innerHTML = '<div class="msg msg-info">Seleccione una cuenta para ver su historial.</div>';
        return;
      }
      url += `&cuenta=${cuenta}`;
    }
    const emp = await obtenerEmpresa();
    const data = await GET(url);
    if (data.error) {
      salida.innerHTML = `<div class="msg msg-error">${data.error}</div>`;
      return;
    }
    salida.innerHTML = '';
    const per = data.periodo || { desde, hasta };
    if (tipo === 'balance') salida.appendChild(envolver(balance(data), emp, per));
    else if (tipo === 'resultados') salida.appendChild(envolver(resultados(data), emp, per));
    else if (tipo === 'anexos') salida.appendChild(envolver(anexos(data), emp, per));
    else if (tipo === 'diario') salida.appendChild(envolver(diario(data), emp, per));
    else if (tipo === 'mayor') salida.appendChild(envolver(mayor(data), emp, per));
    else if (tipo === 'comprobacion') salida.appendChild(envolver(comprobacion(data), emp, per));
    else if (tipo === 'historial') salida.appendChild(envolver(historial(data), emp, per));
    else if (tipo === 'presupuesto') salida.appendChild(envolver(presupuestoReporte(data), emp, per));
    else if (tipo === 'iva') salida.appendChild(envolver(ivaReporte(data), emp, per));
    else salida.appendChild(envolver(catalogoReporte(data), emp, per));
  } catch (err) {
    mensaje(panel, err.message, 'error');
  }
}

// Membrete oficial de la compañía en cada reporte con soporte de rango de fechas.
function envolver(contenido, emp, per) {
  const rangoTexto = per && per.desde && per.hasta
    ? `Período: Del ${per.desde} al ${per.hasta}`
    : `Periodo: ${String(getEstado().mes).padStart(2, '0')}/${getEstado().ano}`;

  const wrapper = el(`
    <div class="membrete" style="background:#fff; padding:16px; border-radius:10px;">
      <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:2px solid #0f766e; padding-bottom:10px; margin-bottom:14px;">
        <div style="display:flex; align-items:center; gap:12px;">
          <img src="img/logo.png" alt="Logo JNJ SRL" style="width:45px; height:45px; object-fit:contain; border-radius:8px;">
          <div>
            <strong style="font-size:16px; color:#0f172a;">${emp.razon_social || 'JNJ SRL'}</strong>
            ${emp.cedula_juridica ? `<br><small style="color:#64748b;">Cédula Jurídica / RNC: ${emp.cedula_juridica}</small>` : ''}
          </div>
        </div>
        <div style="text-align:right;">
          <div style="background:#f0fdfa; color:#0f766e; border:1px solid #ccfbf1; padding:4px 10px; border-radius:6px; font-weight:700; font-size:13px; font-family:var(--mono);">
            ${rangoTexto}
          </div>
        </div>
      </div>
    </div>`);
  wrapper.appendChild(contenido);
  return wrapper;
}

function encabezado(titulo, extra) {
  return el(`
    <div class="encabezado" style="margin-bottom:12px;">
      <h2 style="font-size:18px; margin:0;">${titulo}</h2>
      ${extra || ''}
    </div>`);
}

function balance(d) {
  const wrap = el('<div class="reporte"></div>');
  const rango = d.periodo && d.periodo.desde ? `Del ${d.periodo.desde} al ${d.periodo.hasta}` : `Período ${d.periodo.ano}`;
  wrap.appendChild(encabezado('Balance General', `<p style="font-weight:600; color:#64748b;">${rango}</p>`));

  const seccion = (titulo, items) => {
    const rows = items.map(i =>
      `<tr><td>${i.descripcion}</td><td class="num font-mono">${fmtMoneda(i.saldo)}</td></tr>`).join('');
    return `<h3>${titulo}</h3>
      <table><tbody>${rows}</tbody></table>`;
  };

  wrap.appendChild(elFragment(seccion('ACTIVO', d.activo) +
    `<table><tr class="total-row"><td>TOTAL ACTIVO</td><td class="num font-mono">${fmtMoneda(d.total_activo)}</td></tr></table>` +
    seccion('PASIVO', d.pasivo) +
    `<table><tr class="total-row"><td>TOTAL PASIVO</td><td class="num font-mono">${fmtMoneda(d.total_pasivo)}</td></tr></table>` +
    seccion('PATRIMONIO', d.patrimonio) +
    `<table>
      <tr class="total-row"><td>Utilidad / Pérdida del Período</td><td class="num font-mono">${fmtMoneda(d.utilidad_periodo)}</td></tr>
      <tr class="total-row"><td>TOTAL PATRIMONIO</td><td class="num font-mono">${fmtMoneda(d.total_patrimonio)}</td></tr>
    </table>` +
    `<table>
      <tr class="total-row"><td>Total Pasivo + Patrimonio</td><td class="num font-mono">${fmtMoneda(d.total_pasivo + d.total_patrimonio)}</td></tr>
      <tr class="total-row"><td>Diferencia (debe ser 0.00)</td><td class="num font-mono">${fmtMoneda(d.total_activo - d.total_pasivo - d.total_patrimonio)}</td></tr>
    </table>`));

  wrap.appendChild(el(`<div class="msg ${d.cuadra ? 'msg-ok' : 'msg-error'}" style="margin-top:10px;">
    Balance General: ${d.cuadra ? '✅ CUADRA (Activo = Pasivo + Patrimonio)' : '❌ NO CUADRA'}</div>`));
  return wrap;
}

function resultados(d) {
  const wrap = el('<div class="reporte"></div>');
  const rango = d.periodo && d.periodo.desde ? `Del ${d.periodo.desde} al ${d.periodo.hasta}` : `Período ${d.periodo.ano}`;
  wrap.appendChild(encabezado('Estado de Ganancias o Pérdidas (Resultados)', `<p style="font-weight:600; color:#64748b;">${rango}</p>`));

  const t = (tipo) => {
    const filas = d.filas.filter(f => f.apartado === tipo);
    const rows = filas.map(f =>
      `<tr><td>${f.id_cuenta} · ${f.descripcion}</td>
        <td class="num font-mono">${fmtMoneda(f.actual)}</td></tr>`).join('');
    const tot = tipo === 'INGRESOS' ? d.total_ingresos : d.total_egresos;
    return `<h3>${tipo}</h3>
      <table>
        <thead><tr><th>Cuenta</th><th class="num">Monto Período</th></tr></thead>
        <tbody>${rows}
          <tr class="total-row"><td>TOTAL ${tipo}</td>
            <td class="num font-mono">${fmtMoneda(tot.actual)}</td></tr>
        </tbody>
      </table>`;
  };

  wrap.appendChild(elFragment(t('INGRESOS') + t('EGRESOS') +
    `<table>
      <tr class="total-row" style="font-size:15px; color:#0f766e;"><td>UTILIDAD / PÉRDIDA NETA DEL PERÍODO</td>
        <td class="num font-mono"><strong>${fmtMoneda(d.utilidad.actual)}</strong></td></tr>
    </table>`));
  return wrap;
}

function anexos(d) {
  const wrap = el('<div class="reporte"></div>');
  const rango = d.periodo && d.periodo.desde ? `Del ${d.periodo.desde} al ${d.periodo.hasta}` : '';
  wrap.appendChild(encabezado('Reporte de Anexos', `<p style="font-weight:600; color:#64748b;">${rango}</p>`));

  for (const cta of d.cuentas) {
    const movs = cta.movimientos.map(m =>
      `<tr>
        <td>${m.fecha}</td><td>${m.numero}</td><td>${m.detalle || ''}</td>
        <td class="num font-mono">${m.debito ? fmtMoneda(m.debito) : ''}</td>
        <td class="num font-mono">${m.credito ? fmtMoneda(m.credito) : ''}</td>
      </tr>`).join('');
    wrap.appendChild(elFragment(`
      <h3>${fmtCodigo(cta.id_cuenta)} — ${cta.descripcion}</h3>
      <table>
        <thead><tr>
          <th>Fecha</th><th>N° Documento</th><th>Detalle</th>
          <th class="num">Débito</th><th class="num">Crédito</th>
        </tr></thead>
        <tbody>${movs}
          <tr class="total-row">
            <td colspan="3">Saldo Inicial: ${fmtMoneda(cta.saldo_inicial)} · Saldo Final: ${fmtMoneda(cta.saldo_final)}</td>
            <td class="num"></td><td class="num"></td>
          </tr>
        </tbody>
      </table>`));
  }
  if (d.cuentas.length === 0) wrap.appendChild(el('<div class="msg msg-info">Sin movimientos en el período.</div>'));
  return wrap;
}

function catalogoReporte(d) {
  const wrap = el('<div class="reporte"></div>');
  wrap.appendChild(encabezado('Catálogo de Cuentas'));
  const rows = d.map(c =>
    `<tr><td class="num font-mono">${fmtCodigo(c.id_cuenta)}</td><td>${c.descripcion}</td>
      <td>${c.clase_cuenta_id}. ${c.clase_nombre}</td></tr>`).join('');
  wrap.appendChild(el(`<table>
    <thead><tr><th>Código</th><th>Descripción</th><th>Clase</th></tr></thead>
    <tbody>${rows}</tbody></table>`));
  return wrap;
}

function presupuestoReporte(d) {
  const wrap = el('<div class="reporte"></div>');
  const rango = d.periodo && d.periodo.desde ? `Del ${d.periodo.desde} al ${d.periodo.hasta}` : '';
  wrap.appendChild(encabezado('Presupuesto vs Ejecutado', `<p style="font-weight:600; color:#64748b;">${rango}</p>`));

  if (d.filas.length === 0) {
    wrap.appendChild(el('<div class="msg msg-info">No hay cuentas presupuestadas en el período.</div>'));
    return wrap;
  }

  const pct = (v) => `${v.toFixed(1)}%`;
  const rows = d.filas.map(f =>
    `<tr>
      <td class="num font-mono">${fmtCodigo(f.id_cuenta)}</td>
      <td>${f.descripcion}</td>
      <td>${f.tipo_rubro}</td>
      <td class="num font-mono">${fmtMoneda(f.monto_presupuestado)}</td>
      <td class="num font-mono">${fmtMoneda(f.ejecutado)}</td>
      <td class="num font-mono">${pct(f.variacion_pct)}</td>
    </tr>`).join('');

  wrap.appendChild(el(`
    <table>
      <thead><tr>
        <th>Código</th><th>Cuenta</th><th>Rubro</th>
        <th class="num">Presupuesto</th><th class="num">Ejecutado</th>
        <th class="num">Variación</th>
      </tr></thead>
      <tbody>${rows}
        <tr class="total-row">
          <td colspan="3">TOTALES</td>
          <td class="num font-mono">${fmtMoneda(d.totales.presupuesto)}</td>
          <td class="num font-mono">${fmtMoneda(d.totales.ejecutado)}</td>
          <td class="num font-mono"></td>
        </tr>
      </tbody>
    </table>`));
  return wrap;
}

function ivaReporte(d) {
  const wrap = el('<div class="reporte"></div>');
  const rango = d.periodo && d.periodo.desde ? `Del ${d.periodo.desde} al ${d.periodo.hasta}` : '';
  wrap.appendChild(encabezado('Libro de IVA — Compras y Ventas', `<p style="font-weight:600; color:#64748b;">${rango}</p>`));

  const tabla = (titulo, bloque) => {
    const filas = bloque.filas.map(f =>
      `<tr>
        <td>${f.fecha}</td>
        <td><strong>${f.numero}</strong></td>
        <td>${f.detalle}</td>
        <td class="num font-mono">${fmtMoneda(f.base)}</td>
        <td class="num font-mono">${fmtMoneda(f.iva)}</td>
        <td class="num font-mono font-bold">${fmtMoneda(f.total)}</td>
      </tr>`).join('');
    return `
      <h3>${titulo} (${bloque.filas.length})</h3>
      <table>
        <thead><tr>
          <th>Fecha</th><th>N° Doc</th><th>Detalle</th>
          <th class="num">Base Imponible</th>
          <th class="num">IVA</th>
          <th class="num">Total</th>
        </tr></thead>
        <tbody>
          ${filas.length ? filas : '<tr><td colspan="6" class="vacio">Sin registros</td></tr>'}
          <tr class="total-row">
            <td colspan="3">TOTAL ${titulo.toUpperCase()}</td>
            <td class="num font-mono">${fmtMoneda(bloque.totales.base)}</td>
            <td class="num font-mono">${fmtMoneda(bloque.totales.iva)}</td>
            <td class="num font-mono">${fmtMoneda(bloque.totales.total)}</td>
          </tr>
        </tbody>
      </table>`;
  };

  wrap.appendChild(elFragment(tabla('Ventas (IVA Débito)', d.ventas)));
  wrap.appendChild(elFragment(tabla('Compras (IVA Crédito)', d.compras)));

  const liq = d.liquidacion;
  wrap.appendChild(elFragment(`
    <h3>Liquidación del Período</h3>
    <table>
      <tbody>
        <tr><td>(+) IVA Débito Fiscal (Ventas)</td><td class="num font-mono">${fmtMoneda(liq.iva_debito)}</td></tr>
        <tr><td>(-) IVA Crédito Fiscal (Compras)</td><td class="num font-mono">${fmtMoneda(liq.iva_credito)}</td></tr>
        <tr class="total-row">
          <td><strong>${liq.iva_a_pagar >= 0 ? 'IVA a Pagar al Fisco' : 'Saldo a Favor del Contribuyente'}</strong></td>
          <td class="num font-mono font-bold" style="color:${liq.iva_a_pagar >= 0 ? '#dc2626' : '#15803d'}; font-size:16px;">
            ${fmtMoneda(Math.abs(liq.iva_a_pagar))}
          </td>
        </tr>
      </tbody>
    </table>`));

  return wrap;
}

function diario(d) {
  const wrap = el('<div class="reporte"></div>');
  const rango = d.periodo && d.periodo.desde ? `Del ${d.periodo.desde} al ${d.periodo.hasta}` : '';
  wrap.appendChild(encabezado('Libro Diario', `<p style="font-weight:600; color:#64748b;">${rango}</p>`));

  let totD = 0, totC = 0;
  for (const doc of d.documentos) {
    const lineas = doc.lineas.map(l =>
      `<tr>
        <td class="num font-mono">${fmtCodigo(l.id_cuenta)}</td>
        <td>${l.cuenta_descripcion || ''}</td>
        <td>${l.detalle_linea || ''}</td>
        <td class="num font-mono">${l.tipo_movimiento === 'D' ? fmtMoneda(l.monto) : ''}</td>
        <td class="num font-mono">${l.tipo_movimiento === 'H' ? fmtMoneda(l.monto) : ''}</td>
      </tr>`).join('');
    totD += doc.total_debitos;
    totC += doc.total_creditos;
    wrap.appendChild(elFragment(`
      <div class="doc-diario" style="margin-bottom:16px; border:1px solid #e2e8f0; border-radius:8px; overflow:hidden;">
        <div style="background:#f1f5f9; padding:8px 12px; font-weight:700; font-size:13px; display:flex; justify-content:space-between;">
          <span>Doc: ${doc.numero_documento} · Fecha: ${doc.fecha}</span>
          <span>${doc.detalle_general || ''}</span>
        </div>
        <table>
          <thead><tr><th>Cuenta</th><th>Descripción</th><th>Detalle</th><th class="num">Débito</th><th class="num">Crédito</th></tr></thead>
          <tbody>${lineas}</tbody>
        </table>
      </div>`));
  }

  wrap.appendChild(elFragment(`
    <table>
      <tr class="total-row"><td>TOTAL GENERAL LIBRO DIARIO</td>
        <td class="num font-mono">D: ${fmtMoneda(totD)}</td>
        <td class="num font-mono">C: ${fmtMoneda(totC)}</td></tr>
    </table>`));
  return wrap;
}

function mayor(d) {
  const wrap = el('<div class="reporte"></div>');
  const rango = d.periodo && d.periodo.desde ? `Del ${d.periodo.desde} al ${d.periodo.hasta}` : '';
  wrap.appendChild(encabezado('Libro Mayor', `<p style="font-weight:600; color:#64748b;">${rango}</p>`));

  for (const c of d.cuentas) {
    const movs = c.movimientos.map(m =>
      `<tr>
        <td>${m.fecha}</td><td>${m.numero}</td><td>${m.detalle || ''}</td>
        <td class="num font-mono">${m.debito ? fmtMoneda(m.debito) : ''}</td>
        <td class="num font-mono">${m.credito ? fmtMoneda(m.credito) : ''}</td>
        <td class="num font-mono font-bold">${fmtMoneda(m.saldo)}</td>
      </tr>`).join('');
    wrap.appendChild(elFragment(`
      <h3>${fmtCodigo(c.id_cuenta)} — ${c.descripcion}</h3>
      <table>
        <thead><tr><th>Fecha</th><th>N° Doc</th><th>Detalle</th><th class="num">Débito</th><th class="num">Crédito</th><th class="num">Saldo</th></tr></thead>
        <tbody>
          <tr><td colspan="5"><strong>Saldo Inicial:</strong></td><td class="num font-mono font-bold">${fmtMoneda(c.saldo_inicial)}</td></tr>
          ${movs}
          <tr class="total-row"><td colspan="5"><strong>Saldo Final:</strong></td><td class="num font-mono font-bold">${fmtMoneda(c.saldo_final)}</td></tr>
        </tbody>
      </table>`));
  }
  return wrap;
}

function comprobacion(d) {
  const wrap = el('<div class="reporte"></div>');
  const rango = d.periodo && d.periodo.desde ? `Del ${d.periodo.desde} al ${d.periodo.hasta}` : '';
  wrap.appendChild(encabezado('Balance de Comprobación', `<p style="font-weight:600; color:#64748b;">${rango}</p>`));

  const rows = d.cuentas.map(c =>
    `<tr>
      <td class="num font-mono">${fmtCodigo(c.id_cuenta)}</td>
      <td>${c.descripcion}</td>
      <td class="num font-mono">${fmtMoneda(c.saldo_anterior)}</td>
      <td class="num font-mono">${fmtMoneda(c.debitos)}</td>
      <td class="num font-mono">${fmtMoneda(c.creditos)}</td>
      <td class="num font-mono">${fmtMoneda(c.deudor)}</td>
      <td class="num font-mono">${fmtMoneda(c.acreedor)}</td>
    </tr>`).join('');

  wrap.appendChild(elFragment(`
    <table>
      <thead><tr>
        <th>Código</th><th>Cuenta</th>
        <th class="num">Saldo Ant.</th>
        <th class="num">Débitos</th>
        <th class="num">Créditos</th>
        <th class="num">Saldo Deudor</th>
        <th class="num">Saldo Acreedor</th>
      </tr></thead>
      <tbody>
        ${rows}
        <tr class="total-row">
          <td colspan="3">TOTALES</td>
          <td class="num font-mono">${fmtMoneda(d.totales.debitos)}</td>
          <td class="num font-mono">${fmtMoneda(d.totales.creditos)}</td>
          <td class="num font-mono">${fmtMoneda(d.totales.deudor)}</td>
          <td class="num font-mono">${fmtMoneda(d.totales.acreedor)}</td>
        </tr>
      </tbody>
    </table>
    <div class="msg ${d.totales.cuadra ? 'msg-ok' : 'msg-error'}" style="margin-top:10px;">
      Balance de Comprobación: ${d.totales.cuadra ? '✅ CUADRA PERFECTAMENTE' : '❌ DESCUADRE'}
    </div>`));
  return wrap;
}

function historial(d) {
  const wrap = el('<div class="reporte"></div>');
  const rango = d.periodo && d.periodo.desde ? `Del ${d.periodo.desde} al ${d.periodo.hasta}` : '';
  wrap.appendChild(encabezado(`Historial de Cuenta: ${fmtCodigo(d.cuenta.id_cuenta)} — ${d.cuenta.descripcion}`,
    `<p style="font-weight:600; color:#64748b;">${rango}</p>`));

  const movs = d.movimientos.map(m =>
    `<tr>
      <td>${m.fecha}</td>
      <td>${m.numero}</td>
      <td>${m.detalle || ''}</td>
      <td class="num font-mono">${m.debito ? fmtMoneda(m.debito) : ''}</td>
      <td class="num font-mono">${m.credito ? fmtMoneda(m.credito) : ''}</td>
      <td class="num font-mono font-bold">${fmtMoneda(m.saldo)}</td>
    </tr>`).join('');

  wrap.appendChild(elFragment(`
    <table>
      <thead><tr>
        <th>Fecha</th><th>N° Doc</th><th>Detalle</th>
        <th class="num">Débito</th><th class="num">Crédito</th>
        <th class="num">Saldo Corrido</th>
      </tr></thead>
      <tbody>
        <tr><td colspan="5"><strong>Saldo Inicial:</strong></td><td class="num font-mono font-bold">${fmtMoneda(d.saldo_inicial)}</td></tr>
        ${movs.length ? movs : '<tr><td colspan="6" class="vacio">Sin movimientos en el período</td></tr>'}
        <tr class="total-row"><td colspan="5"><strong>Saldo Final:</strong></td><td class="num font-mono font-bold">${fmtMoneda(d.saldo_final)}</td></tr>
      </tbody>
    </table>`));
  return wrap;
}

function exportarCSV(panel) {
  const tabla = panel.querySelector('table');
  if (!tabla) return;
  let csv = [];
  for (const fila of tabla.querySelectorAll('tr')) {
    const celdas = [];
    for (const td of fila.querySelectorAll('th, td')) {
      celdas.push(`"${td.innerText.replace(/"/g, '""')}"`);
    }
    csv.push(celdas.join(';'));
  }
  const blob = new Blob([csv.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `reporte_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
}

registrarModulo('reportes', { render });