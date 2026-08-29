import { getEstado } from '../app.js';
import { registrarModulo } from '../registro.js';
import { el, mensaje, fmtCodigo, fmtMonto, cargarClases, configurarMascaraCuenta, nivelDe, paginaHeader, statCard, esqueletoTabla } from '../ui.js';
import { GET, POST, PUT, DEL } from '../api.js';

function etiqueta(cuenta) {
  const n = nivelDe(cuenta);
  if (n === 1) return 'mayor';
  if (n === 2) return 'sub';
  return 'det';
}

function indice(cuenta) {
  const n = nivelDe(cuenta);
  return n === 1 ? '' : n === 2 ? '&nbsp;&nbsp;└ ' : '&nbsp;&nbsp;&nbsp;&nbsp;└ ';
}

export function render() {
  const e = getEstado();
  const contenido = document.getElementById('app-contenido');
  contenido.innerHTML = '';

  contenido.appendChild(paginaHeader('Catálogo de Cuentas',
    'Plan contable clasificado por niveles y cuentas de mayor.', `COMPAÑÍA ${e.compania}`));

  const stats = el('<div class="stats-grid" id="stats-cuentas"></div>');
  contenido.appendChild(stats);

  const panel = el(`
    <div class="panel">
      <div class="toolbar">
        <button class="btn" id="btn-nueva-cuenta">+ Nueva Cuenta</button>
      </div>
      <div class="table-scroll" style="max-height:62vh">
        <table>
          <thead><tr>
            <th>Código</th><th>Descripción</th><th>Clase</th><th>Nivel</th>
            <th>Desglose</th><th>Presup.</th><th>Acciones</th>
          </tr></thead>
          <tbody id="tabla-cuentas"></tbody>
        </table>
      </div>
    </div>`);
  contenido.appendChild(panel);

  const tb = panel.querySelector('#tabla-cuentas');
  const td = document.createElement('td');
  td.colSpan = 7;
  td.appendChild(esqueletoTabla(5, 7));
  const trSkel = document.createElement('tr');
  trSkel.appendChild(td);
  tb.appendChild(trSkel);

  panel.querySelector('#btn-nueva-cuenta').addEventListener('click', () => formularioNueva(panel));
  cargarLista(tb, panel);
}

async function cargarLista(tb, panel) {
  const e = getEstado();
  try {
    const cuentas = await GET(`/api/cuentas?compania=${e.compania}`);
    tb.innerHTML = '';

    const stats = document.getElementById('stats-cuentas');
    if (stats) {
      const n1 = cuentas.filter(c => nivelDe(c) === 1).length;
      const n2 = cuentas.filter(c => nivelDe(c) === 2).length;
      const n3 = cuentas.filter(c => nivelDe(c) === 3).length;
      const presup = cuentas.filter(c => c.presupuesta).length;
      stats.innerHTML = '';
      stats.appendChild(statCard({ etiqueta: 'Cuentas', valor: cuentas.length, icono: '▤' }));
      stats.appendChild(statCard({ etiqueta: 'Mayores', valor: n1, icono: '≡', tono: 'tone-blue' }));
      stats.appendChild(statCard({ etiqueta: 'Subcuentas', valor: n2, icono: '⇥', tono: 'tone-amber' }));
      stats.appendChild(statCard({ etiqueta: 'Detalle', valor: n3, icono: '☷', tono: 'tone-violet' }));
      stats.appendChild(statCard({ etiqueta: 'Presupuestadas', valor: presup, icono: '₡', tono: 'tone-red' }));
    }

    for (const c of cuentas) {
      const tag = c.es_desglose ? '<span class="tag tag-S">desglose</span>' : '';
      const presup = c.presupuesta
        ? `<span class="tag tag-G">₡${fmtMonto(c.monto_presupuestado || 0)}</span>`
        : '';
      const tr = el(`<tr class="nivel${nivelDe(c)}">
        <td class="num">${indice(c)}${fmtCodigo(c.id_cuenta)}</td>
        <td>${c.descripcion}</td>
        <td>${c.clase_cuenta_id}. ${c.clase_nombre}</td>
        <td><span class="tag tag-${etiqueta(c)}">${nivelDe(c) === 1 ? 'Mayor' : nivelDe(c) === 2 ? 'Subcuenta' : 'Detalle'}</span></td>
        <td>${tag}</td>
        <td>${presup}</td>
        <td>
          <button class="btn btn-gris" data-editar="${c.id_cuenta}">Editar</button>
          <button class="btn btn-rojo" data-borrar="${c.id_cuenta}">Eliminar</button>
        </td>
      </tr>`);
      tr.querySelector('[data-editar]').addEventListener('click', () => editar(c, panel));
      tr.querySelector('[data-borrar]').addEventListener('click', async () => {
        try {
          await DEL(`/api/cuentas/${c.id_cuenta}`);
          cargarLista(tb, panel);
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

function formularioNueva(panel) {
  const e = getEstado();
  const form = el(`
    <div class="panel">
      <h2>Nueva Cuenta — Compañía ${e.compania}</h2>
      <div class="form-grid">
        <div><label>Código (XXX-XX-XXX)</label><input class="cuenta" id="n-codigo" maxlength="11"></div>
        <div><label>Descripción</label><input id="n-desc"></div>
        <div><label>Descripción (Inglés)</label><input id="n-desc-en"></div>
        <div><label>Clase de Cuenta <span id="n-clase-nota"></span></label><select id="n-clase"></select></div>
        <div><label>Detalle 1</label><input id="n-det1"></div>
        <div><label>Detalle 2</label><input id="n-det2"></div>
        <div><label class="check"><input type="checkbox" id="n-presup"> Marcar como cuenta presupuestada</label></div>
        <div><label>Monto Presupuestado</label><input id="n-monto" type="number" step="0.01" value="0"></div>
      </div>
      <div class="toolbar">
        <button class="btn" id="n-guardar">Guardar</button>
        <button class="btn btn-gris" id="n-cancelar">Cancelar</button>
      </div>
    </div>`);
  panel.after(form);
  configurarMascaraCuenta(form.querySelector('#n-codigo'));

  const select = form.querySelector('#n-clase');
  cargarClases(select).then(() => {
    form.querySelector('#n-codigo').addEventListener('change', () => {
      const cod = form.querySelector('#n-codigo').value.replace(/\D/g, '');
      const esMayor = cod && cod.slice(3, 5) === '00' && cod.slice(5, 8) === '000';
      select.disabled = !esMayor;
      form.querySelector('#n-clase-nota').textContent = esMayor ? '(define la clase)' : '(se hereda de la Cuenta Mayor)';
    });
  });

  form.querySelector('#n-cancelar').addEventListener('click', () => form.remove());

  form.querySelector('#n-guardar').addEventListener('click', async () => {
    const cuerpo = {
      id_compania: e.compania,
      codigo: form.querySelector('#n-codigo').value,
      descripcion: form.querySelector('#n-desc').value,
      descripcion_ingles: form.querySelector('#n-desc-en').value || null,
      clase_cuenta_id: select.disabled ? null : Number(select.value),
      detalle1: form.querySelector('#n-det1').value || null,
      detalle2: form.querySelector('#n-det2').value || null,
      presupuesta: form.querySelector('#n-presup').checked ? 1 : 0,
      monto_presupuestado: Number(form.querySelector('#n-monto').value) || 0,
    };
    try {
      await POST('/api/cuentas', cuerpo);
      form.remove();
      render();
    } catch (err) {
      mensaje(form, err.message, 'error');
    }
  });
}

function editar(cuenta, panel) {
  const form = el(`
    <div class="panel">
      <h2>Editar Cuenta ${fmtCodigo(cuenta.id_cuenta)} — ${cuenta.descripcion}</h2>
      <div class="form-grid">
        <div><label>Descripción</label><input id="ed-desc" value="${cuenta.descripcion}"></div>
        <div><label>Descripción (Inglés)</label><input id="ed-desc-en" value="${cuenta.descripcion_ingles || ''}"></div>
        <div><label>Clase ${cuenta.es_cuenta_mayor ? '(define la clase y la hereda)' : '(se hereda de la Cuenta Mayor)'}</label>
          <select id="ed-clase" ${cuenta.es_cuenta_mayor ? '' : 'disabled'}></select></div>
        <div><label>Detalle 1</label><input id="ed-det1" value="${cuenta.detalle1 || ''}"></div>
        <div><label>Detalle 2</label><input id="ed-det2" value="${cuenta.detalle2 || ''}"></div>
        <div><label class="check"><input type="checkbox" id="ed-presup" ${cuenta.presupuesta ? 'checked' : ''}> Marcar como cuenta presupuestada</label></div>
        <div><label>Monto Presupuestado</label><input id="ed-monto" type="number" step="0.01" value="${cuenta.monto_presupuestado || 0}"></div>
      </div>
      <div class="toolbar">
        <button class="btn" id="ed-guardar">Guardar</button>
        <button class="btn btn-gris" id="ed-cancelar">Cancelar</button>
      </div>
    </div>`);
  panel.after(form);

  cargarClases(form.querySelector('#ed-clase')).then(clases => {
    const sel = form.querySelector('#ed-clase');
    sel.value = String(cuenta.clase_cuenta_id);
  });

  form.querySelector('#ed-cancelar').addEventListener('click', () => form.remove());

  form.querySelector('#ed-guardar').addEventListener('click', async () => {
    const cuerpo = {
      descripcion: form.querySelector('#ed-desc').value,
      descripcion_ingles: form.querySelector('#ed-desc-en').value || null,
      clase_cuenta_id: cuenta.es_cuenta_mayor ? Number(form.querySelector('#ed-clase').value) : undefined,
      detalle1: form.querySelector('#ed-det1').value || null,
      detalle2: form.querySelector('#ed-det2').value || null,
      presupuesta: form.querySelector('#ed-presup').checked ? 1 : 0,
      monto_presupuestado: Number(form.querySelector('#ed-monto').value) || 0,
    };
    try {
      await PUT(`/api/cuentas/${cuenta.id_cuenta}`, cuerpo);
      form.remove();
      render();
    } catch (err) {
      mensaje(form, err.message, 'error');
    }
  });
}

registrarModulo('catalogo', { render });