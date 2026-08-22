import { getEstado } from '../app.js';
import { registrarModulo } from '../registro.js';
import { el, mensaje, fmtCodigo, fmtMoneda, configurarMascaraCuenta, paginaHeader, statCard, esqueletoTabla } from '../ui.js';
import { GET, POST, DEL } from '../api.js';

const FILAS = [];

export function render() {
  const e = getEstado();
  const contenido = document.getElementById('app-contenido');
  contenido.innerHTML = '';

  contenido.appendChild(paginaHeader('Asientos Contables',
    'Partida doble estricta — solo cuentas de desglose y Débitos = Créditos.',
    `MÓDULO 3 · ${String(e.mes).padStart(2, '0')}/${e.ano}`));

  const stats = el('<div class="stats-grid" id="stats-asientos"></div>');
  contenido.appendChild(stats);

  const panel = el(`
    <div class="panel">
      <div class="toolbar">
        <button class="btn" id="btn-nuevo-asiento">+ Nuevo Documento</button>
        <span class="msg-info" style="padding:7px 12px">Solo cuentas de desglose · Débitos = Créditos</span>
      </div>
      <div class="table-scroll">
        <table>
          <thead><tr>
            <th>Número</th><th>Fecha</th><th>Tipo</th><th>Detalle</th>
            <th class="num">Débitos</th><th class="num">Créditos</th><th>Acciones</th>
          </tr></thead>
          <tbody id="tabla-asientos"></tbody>
        </table>
      </div>
    </div>`);
  contenido.appendChild(panel);

  const tb = panel.querySelector('#tabla-asientos');
  const td = document.createElement('td');
  td.colSpan = 7;
  td.appendChild(esqueletoTabla(4, 7));
  const trSkel = document.createElement('tr');
  trSkel.appendChild(td);
  tb.appendChild(trSkel);

  panel.querySelector('#btn-nuevo-asiento').addEventListener('click', () => formularioNuevo(panel));
  cargarLista(panel);
}

async function cargarLista(panel) {
  const e = getEstado();
  try {
    const docs = await GET(`/api/asientos?compania=${e.compania}&ano=${e.ano}&mes=${e.mes}`);
    const tb = panel.querySelector('#tabla-asientos');
    tb.innerHTML = '';

    const stats = document.getElementById('stats-asientos');
    if (stats) {
      const tD = docs.reduce((s, d) => s + (d.total_debitos || 0), 0);
      const tC = docs.reduce((s, d) => s + (d.total_creditos || 0), 0);
      stats.innerHTML = '';
      stats.appendChild(statCard({ etiqueta: 'Documentos', valor: docs.length, icono: '≡' }));
      stats.appendChild(statCard({ etiqueta: 'Débitos', valor: fmtMoneda(tD), icono: '◥', tono: 'tone-blue' }));
      stats.appendChild(statCard({ etiqueta: 'Créditos', valor: fmtMoneda(tC), icono: '◣', tono: 'tone-amber' }));
      stats.appendChild(statCard({ etiqueta: 'Diferencia', valor: fmtMoneda(tD - tC), icono: '⇄', tono: Math.abs(tD - tC) < 0.005 ? '' : 'tone-red' }));
    }

    for (const d of docs) {
      const tr = el(`<tr>
        <td>${d.numero_documento}</td>
        <td>${d.fecha}</td>
        <td>${d.tipo_documento}</td>
        <td>${d.detalle_general || ''}
          <div style="font-size:11px;color:#6b6253">${(d.lineas || []).map(l =>
            `${fmtCodigo(l.id_cuenta)} ${l.tipo_movimiento === 'D' ? 'Débito' : 'Crédito'} ${fmtMoneda(l.monto)}${l.detalle_linea ? ' · ' + l.detalle_linea : ''}`
          ).join('<br>')}</div>
        </td>
        <td class="num">${fmtMoneda(d.total_debitos)}</td>
        <td class="num">${fmtMoneda(d.total_creditos)}</td>
        <td><button class="btn btn-rojo" data-borrar="${d.id_documento}">Eliminar</button></td>
      </tr>`);
      tr.querySelector('[data-borrar]').addEventListener('click', async () => {
        if (!confirm('¿Eliminar el documento y sus líneas?')) return;
        try {
          await DEL(`/api/asientos/${d.id_documento}`);
          cargarLista(panel);
        } catch (err) {
          mensaje(panel, err.message, 'error');
        }
      });
      tb.appendChild(tr);
    }
  } catch (err) {
    mensaje(panel, err.message, 'error');
  }
}

async function formularioNuevo(panel) {
  const e = getEstado();
  FILAS.length = 0;

  const cuentas = await GET(`/api/cuentas?compania=${e.compania}`).catch(() => []);
  const datalistId = 'dl-desglose';
  const options = cuentas.filter(c => c.es_desglose)
    .map(c => `<option value="${fmtCodigo(c.id_cuenta)}">${c.descripcion}</option>`).join('');

  const form = el(`
    <div class="panel">
      <h2>Nuevo Documento</h2>
      <div class="form-grid">
        <div><label>Número</label><input id="a-numero"></div>
        <div><label>Fecha</label><input id="a-fecha" type="date"></div>
        <div><label>Tipo</label>
          <select id="a-tipo">
            <option value="1">1. General</option>
            <option value="2">2. Ingreso</option>
            <option value="3">3. Gasto</option>
            <option value="77">77. Cheque</option>
          </select>
        </div>
        <div><label>Detalle General</label><input id="a-detalle"></div>
      </div>

      <datalist id="${datalistId}">${options}</datalist>

      <h3>Líneas del Asiento</h3>
      <div class="form-grid" style="grid-template-columns:160px 1fr 90px 150px 40px">
        <div><label>Cuenta</label></div>
        <div><label>Detalle</label></div>
        <div><label>Débito</label></div>
        <div><label>Crédito</label></div>
        <div></div>
      </div>
      <div id="a-filas"></div>
      <div class="toolbar">
        <button class="btn btn-gris" id="a-agregar">+ Agregar Línea</button>
      </div>

      <div style="margin-top:10px; font-family:var(--mono)">
        Débitos: <span id="a-tot-d">0.00</span> ·
        Créditos: <span id="a-tot-c">0.00</span> ·
        Diferencia: <span id="a-dif" class="diferencia bad">0.00</span>
      </div>

      <div class="toolbar">
        <button class="btn" id="a-guardar">Guardar Documento</button>
        <button class="btn btn-gris" id="a-cancelar">Cancelar</button>
      </div>
    </div>`);
  panel.after(form);

  const fecha = `${e.ano}-${String(e.mes).padStart(2, '0')}-01`;
  form.querySelector('#a-fecha').value = fecha;
  form.querySelector('#a-numero').value = (await GET(`/api/asientos/proximo?compania=${e.compania}&ano=${e.ano}`)).numero;

  form.querySelector('#a-cancelar').addEventListener('click', () => form.remove());

  form.querySelector('#a-agregar').addEventListener('click', () => agregarFila(form, datalistId));

  form.querySelector('#a-guardar').addEventListener('click', async () => {
    const lineas = FILAS.map(f => ({
      id_cuenta: f.cuenta.value.replace(/\D/g, ''),
      detalle_linea: f.detalle.value,
      tipo_movimiento: f.debito.value ? 'D' : 'H',
      monto: Number(f.debito.value || f.credito.value || 0),
    }));
    const cuerpo = {
      id_compania: e.compania,
      numero_documento: form.querySelector('#a-numero').value,
      tipo_documento: Number(form.querySelector('#a-tipo').value),
      fecha: form.querySelector('#a-fecha').value,
      detalle_general: form.querySelector('#a-detalle').value,
      lineas,
    };
    try {
      await POST('/api/asientos', cuerpo);
      form.remove();
      render();
    } catch (err) {
      mensaje(form, err.message, 'error');
    }
  });

  agregarFila(form, datalistId);
}

function agregarFila(form, datalistId) {
  const cont = form.querySelector('#a-filas');
  const fila = el(`<div class="linea">
    <input class="cuenta" list="${datalistId}" maxlength="11">
    <input class="detalle">
    <input class="monto debito" type="number" min="0" step="0.01">
    <input class="monto credito" type="number" min="0" step="0.01">
    <span class="elim" title="Eliminar">×</span>
  </div>`);
  configurarMascaraCuenta(fila.querySelector('.cuenta'));
  fila.querySelector('.elim').addEventListener('click', () => {
    fila.remove();
    const i = FILAS.indexOf(entrada);
    if (i >= 0) FILAS.splice(i, 1);
    recalcular(form);
  });

  const entrada = {
    cuenta: fila.querySelector('.cuenta'),
    detalle: fila.querySelector('.detalle'),
    debito: fila.querySelector('.debito'),
    credito: fila.querySelector('.credito'),
  };
  entrada.debito.addEventListener('input', () => { if (entrada.debito.value) entrada.credito.value = ''; recalcular(form); });
  entrada.credito.addEventListener('input', () => { if (entrada.credito.value) entrada.debito.value = ''; recalcular(form); });

  FILAS.push(entrada);
  cont.appendChild(fila);
  entrada.cuenta.focus();
  recalcular(form);
}

function recalcular(form) {
  let d = 0, c = 0;
  for (const f of FILAS) {
    d += Number(f.debito.value || 0);
    c += Number(f.credito.value || 0);
  }
  const dif = d - c;
  form.querySelector('#a-tot-d').textContent = fmtMoneda(d);
  form.querySelector('#a-tot-c').textContent = fmtMoneda(c);
  const elDif = form.querySelector('#a-dif');
  elDif.textContent = fmtMoneda(dif);
  elDif.classList.toggle('ok', Math.abs(dif) < 0.005);
  elDif.classList.toggle('bad', Math.abs(dif) >= 0.005);
}

registrarModulo('asientos', { render });