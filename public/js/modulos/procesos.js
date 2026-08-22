import { getEstado } from '../app.js';
import { registrarModulo } from '../registro.js';
import { el, mensaje, fmtMoneda, configurarMascaraCuenta, paginaHeader } from '../ui.js';
import { POST, GET } from '../api.js';

const APERTURA = [];

export function render() {
  const e = getEstado();
  const contenido = document.getElementById('app-contenido');
  contenido.innerHTML = '';

  contenido.appendChild(paginaHeader('Procesos Varios',
    'Mayorización, cierres de período, saldos de apertura y respaldo de la base de datos.',
    `MÓDULO 4 · COMPAÑÍA ${e.compania}`));

  const panel = el(`
    <div class="panel">
      <h2>Mayorización y cierres</h2>
      <div class="form-grid">
        <div><label>Período</label>
          <div style="display:flex;gap:8px">
            <select id="p-mes">${[1,2,3,4,5,6,7,8,9,10,11,12].map(m =>
              `<option value="${m}" ${m === e.mes ? 'selected' : ''}>${String(m).padStart(2, '0')}</option>`).join('')}
            </select>
            <input id="p-ano" type="number" value="${e.ano}" style="width:110px">
          </div>
        </div>
        <div><label>Número apertura</label><input id="p-apertura-num" value="${e.ano}-APERTURA"></div>
      </div>
      <div class="toolbar">
        <button class="btn" id="p-mayorizar">Mayorización del Período</button>
        <button class="btn" id="p-cierre">Cierre Mensual</button>
        <button class="btn" id="p-cierre-anual">Cierre Anual</button>
      </div>
      <div id="p-resultado"></div>
    </div>`);
  contenido.appendChild(panel);

  const cuerpo = () => ({
    id_compania: e.compania,
    ano: Number(panel.querySelector('#p-ano').value),
    mes: Number(panel.querySelector('#p-mes').value),
  });

  panel.querySelector('#p-mayorizar').addEventListener('click', async () => {
    try {
      const r = await POST('/api/procesos/mayorizacion', cuerpo());
      mensaje(panel.querySelector('#p-resultado'), `Mayorización ejecutada: ${r.cuentas_procesadas} cuentas procesadas.`, 'ok');
    } catch (err) {
      mensaje(panel.querySelector('#p-resultado'), err.message, 'error');
    }
  });

  panel.querySelector('#p-cierre').addEventListener('click', async () => {
    try {
      const r = await POST('/api/procesos/cierre-mensual', cuerpo());
      mensaje(panel.querySelector('#p-resultado'),
        `Cierre mensual realizado. Siguiente período: ${r.siguiente_periodo}.`, 'ok');
    } catch (err) {
      mensaje(panel.querySelector('#p-resultado'), err.message, 'error');
    }
  });

  panel.querySelector('#p-cierre-anual').addEventListener('click', async () => {
    if (!confirm('¿Cerrar el ejercicio anual y traspasar saldos al año siguiente?')) return;
    try {
      const r = await POST('/api/procesos/cierre-anual', cuerpo());
      mensaje(panel.querySelector('#p-resultado'),
        `Cierre anual realizado. Nuevo período de trabajo: ${r.nuevo_periodo}.`, 'ok');
    } catch (err) {
      mensaje(panel.querySelector('#p-resultado'), err.message, 'error');
    }
  });

  seccionApertura(panel);
  seccionBackup(panel);
}

// ---- Respaldo y Restauración de la Base de Datos ---------------------------
async function seccionBackup(panel) {
  const sec = el(`
    <div class="panel">
      <h2>Respaldo y Restauración de la Base de Datos</h2>
      <div class="toolbar">
        <button class="btn" id="bk-crear">Crear Respaldo</button>
        <label class="btn btn-gris" style="cursor:pointer">Restaurar desde Archivo
          <input type="file" id="bk-archivo" accept=".db" style="display:none">
        </label>
      </div>
      <div id="bk-msg"></div>
      <table style="margin-top:10px">
        <thead><tr><th>Archivo</th><th>Fecha</th><th>Tamaño</th><th></th></tr></thead>
        <tbody id="bk-lista"></tbody>
      </table>
    </div>`);
  panel.after(sec);

  sec.querySelector('#bk-crear').addEventListener('click', async () => {
    try {
      const r = await POST('/api/backup/crear', {});
      mensaje(sec.querySelector('#bk-msg'),
        `Respaldo creado: ${r.file} (${fmtBytes(r.size)}) — ${r.cuentas} cuentas, ${r.asientos} asientos.`, 'ok');
      listarBackups(sec);
    } catch (err) {
      mensaje(sec.querySelector('#bk-msg'), err.message, 'error');
    }
  });

  sec.querySelector('#bk-archivo').addEventListener('change', async (ev) => {
    const file = ev.target.files[0];
    if (!file) return;
    if (!confirm(`¿Restaurar la base de datos desde "${file.name}"?\nSe sustituirá la base actual y habrá que reiniciar el servidor.`)) {
      ev.target.value = '';
      return;
    }
    try {
      const r = await fetch('/api/backup/restaurar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: file,
      });
      const data = await r.json();
      mensaje(sec.querySelector('#bk-msg'), data.error || data.mensaje, data.error ? 'error' : 'ok');
      if (data.ok) {
        mensaje(sec.querySelector('#bk-msg'),
          data.mensaje + ' Reinicie el servidor (detenga y vuelva a ejecutar "node server.js").', 'ok');
      }
    } catch (err) {
      mensaje(sec.querySelector('#bk-msg'), err.message, 'error');
    }
    ev.target.value = '';
  });

  listarBackups(sec);
}

async function listarBackups(sec) {
  const lista = sec.querySelector('#bk-lista');
  let backups = [];
  try { backups = await GET('/api/backup/listar'); } catch { backups = []; }
  lista.innerHTML = backups.map(b => `
    <tr>
      <td class="num">${b.file}</td>
      <td>${new Date(b.fecha).toLocaleString('es-CR')}</td>
      <td class="num">${fmtBytes(b.size)}</td>
      <td><button class="btn btn-gris" data-descargar="${b.file}">Descargar</button></td>
    </tr>`).join('') || '<tr><td colspan="4">Sin respaldos. Cree el primero con el botón superior.</td></tr>';

  lista.querySelectorAll('[data-descargar]').forEach(btn =>
    btn.addEventListener('click', () => {
      const a = document.createElement('a');
      a.href = `/api/backup/descargar?file=${encodeURIComponent(btn.dataset.descargar)}`;
      a.click();
    }));
}

const fmtBytes = (n) => {
  const kb = n / 1024;
  return kb >= 1024 ? `${(kb / 1024).toFixed(2)} MB` : `${kb.toFixed(1)} KB`;
};

// ---- Saldo Inicial / Apertura de cuentas ----------------------------------
async function seccionApertura(panel) {
  const e = getEstado();
  const cuentas = await GET(`/api/cuentas?compania=${e.compania}`).catch(() => []);
  const dlId = 'dl-apertura';
  const options = cuentas.filter(c => c.es_desglose)
    .map(c => `<option value="${fmtCuenta(c.id_cuenta)}">${c.descripcion}</option>`).join('');

  const sec = el(`
    <div class="panel">
      <h2>Saldo Inicial (Apertura de Cuentas)</h2>
      <p style="font-size:12px;color:#555">Registra los saldos al arrancar la contabilidad. Se guarda como un
        documento de apertura (Tipo 0) balanceado; el Estado de Resultados lo ignora.</p>
      <datalist id="${dlId}">${options}</datalist>
      <div class="form-grid" style="grid-template-columns:160px 1fr 150px 150px 40px">
        <div><label>Cuenta</label></div>
        <div><label>Detalle</label></div>
        <div><label>Débito</label></div>
        <div><label>Crédito</label></div>
        <div></div>
      </div>
      <div id="ap-filas"></div>
      <div class="toolbar">
        <button class="btn btn-gris" id="ap-agregar">+ Agregar Línea</button>
      </div>
      <div style="margin-top:10px; font-family:var(--mono)">
        Débitos: <span id="ap-tot-d">0.00</span> ·
        Créditos: <span id="ap-tot-c">0.00</span> ·
        Diferencia: <span id="ap-dif" class="diferencia bad">0.00</span>
      </div>
      <div class="toolbar">
        <button class="btn" id="ap-guardar">Guardar Apertura</button>
      </div>
    </div>`);
  panel.after(sec);

  sec.querySelector('#ap-agregar').addEventListener('click', () => agregarLinea(sec, dlId));

  sec.querySelector('#ap-guardar').addEventListener('click', async () => {
    const lineas = APERTURA.map(f => ({
      id_cuenta: f.cuenta.value.replace(/\D/g, ''),
      detalle_linea: f.detalle.value,
      tipo_movimiento: f.debito.value ? 'D' : 'H',
      monto: Number(f.debito.value || f.credito.value || 0),
    }));
    const cuerpoAper = {
      id_compania: e.compania,
      tipo_documento: 0,
      numero_documento: panel.querySelector('#p-apertura-num').value,
      fecha: `${panel.querySelector('#p-ano').value}-${String(panel.querySelector('#p-mes').value).padStart(2, '0')}-01`,
      detalle_general: 'Saldo inicial / Apertura de cuentas',
      lineas,
    };
    try {
      await POST('/api/asientos', cuerpoAper);
      mensaje(sec, 'Apertura guardada. Ejecute la mayorización para calcular los saldos.', 'ok');
      APERTURA.length = 0;
      sec.querySelector('#ap-filas').innerHTML = '';
      recalcular(sec);
    } catch (err) {
      mensaje(sec, err.message, 'error');
    }
  });

  agregarLinea(sec, dlId);
}

const fmtCuenta = (id) => String(id).replace(/(\d{3})(\d{2})(\d{3})/, '$1-$2-$3');

function agregarLinea(sec, dlId) {
  const cont = sec.querySelector('#ap-filas');
  const fila = el(`<div class="linea">
    <input class="cuenta" list="${dlId}" maxlength="11">
    <input class="detalle">
    <input class="monto debito" type="number" min="0" step="0.01">
    <input class="monto credito" type="number" min="0" step="0.01">
    <span class="elim" title="Eliminar">×</span>
  </div>`);
  configurarMascaraCuenta(fila.querySelector('.cuenta'));

  const entrada = {
    cuenta: fila.querySelector('.cuenta'),
    detalle: fila.querySelector('.detalle'),
    debito: fila.querySelector('.debito'),
    credito: fila.querySelector('.credito'),
  };
  entrada.debito.addEventListener('input', () => { if (entrada.debito.value) entrada.credito.value = ''; recalcular(sec); });
  entrada.credito.addEventListener('input', () => { if (entrada.credito.value) entrada.debito.value = ''; recalcular(sec); });
  fila.querySelector('.elim').addEventListener('click', () => {
    fila.remove();
    const i = APERTURA.indexOf(entrada);
    if (i >= 0) APERTURA.splice(i, 1);
    recalcular(sec);
  });

  APERTURA.push(entrada);
  cont.appendChild(fila);
  entrada.cuenta.focus();
  recalcular(sec);
}

function recalcular(sec) {
  let d = 0, c = 0;
  for (const f of APERTURA) {
    d += Number(f.debito.value || 0);
    c += Number(f.credito.value || 0);
  }
  const dif = d - c;
  sec.querySelector('#ap-tot-d').textContent = fmtMoneda(d);
  sec.querySelector('#ap-tot-c').textContent = fmtMoneda(c);
  const elDif = sec.querySelector('#ap-dif');
  elDif.textContent = fmtMoneda(dif);
  elDif.classList.toggle('ok', Math.abs(dif) < 0.005);
  elDif.classList.toggle('bad', Math.abs(dif) >= 0.005);
}

registrarModulo('procesos', { render });