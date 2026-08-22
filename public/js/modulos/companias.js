import { setCompania, getEstado, refrescar, sincronizarTodoElSistema } from '../app.js';
import { registrarModulo } from '../registro.js';
import { el, mensaje, paginaHeader, statCard, esqueletoTabla } from '../ui.js';
import { POST } from '../api.js';

export function render() {
  const contenido = document.getElementById('app-contenido');
  const e = getEstado();
  contenido.innerHTML = '';
  contenido.appendChild(paginaHeader('Compañías & Multi-Empresa',
    'Administración centralizada de empresas — Seleccione, active o sincronice la entidad de trabajo.', 'JNJ SRL · EMPRESAS'));

  // Barra de sincronización global superior
  const toolbarGlobal = el(`
    <div class="panel" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; padding:16px 20px; background:linear-gradient(to right, #f8fafc, #f1f5f9); border-left:4px solid #0f766e; margin-bottom:16px;">
      <div>
        <strong style="font-size:15px; color:#0f172a;">Sincronización Global de Entidad</strong>
        <p style="margin:2px 0 0 0; font-size:13px; color:#64748b;">Aplica la empresa seleccionada instantáneamente en POS, Inventario, Clientes, Bancos, Reportes y Contabilidad.</p>
      </div>
      <button class="btn btn-primary" id="btn-sync-global-header" style="padding:10px 22px; font-weight:700; font-size:14px; border-radius:8px; display:inline-flex; align-items:center; gap:8px;">
        🔄 Refrescar & Sincronizar Todo
      </button>
    </div>`);
  contenido.appendChild(toolbarGlobal);

  toolbarGlobal.querySelector('#btn-sync-global-header').addEventListener('click', async () => {
    const btn = toolbarGlobal.querySelector('#btn-sync-global-header');
    const orig = btn.textContent;
    btn.textContent = '⏳ Sincronizando servicios...';
    btn.disabled = true;
    try {
      await sincronizarTodoElSistema();
      render();
    } finally {
      btn.textContent = orig;
      btn.disabled = false;
    }
  });

  const stats = el('<div class="stats-grid" id="stats-companias"></div>');
  contenido.appendChild(stats);

  const tabla = el(`<div class="panel">
    <h2>Empresas registradas en el Sistema</h2>
    <div class="table-scroll">
      <table>
        <thead><tr>
          <th>Código</th><th>Razón Social</th><th>Cédula Jurídica / RNC</th>
          <th>Período Activo</th><th>Acción</th>
        </tr></thead>
        <tbody></tbody>
      </table>
    </div></div>`);
  contenido.appendChild(tabla);

  const tb = tabla.querySelector('tbody');
  tb.appendChild(el('<tr><td colspan="5"></td></tr>'));
  tb.querySelector('td').appendChild(esqueletoTabla(3, 5));

  fetch('/api/companias').then(r => r.json()).then(comps => {
    const activa = comps.find(x => x.id_compania === e.compania);
    stats.appendChild(statCard({ etiqueta: 'Total Empresas', valor: comps.length, icono: '🏢' }));
    stats.appendChild(statCard({
      etiqueta: 'Empresa Activa', valor: activa ? `${activa.id_compania} · ${activa.razon_social}` : '—',
      icono: '⚑', tono: 'tone-blue', small: true,
    }));
    stats.appendChild(statCard({
      etiqueta: 'Período Activo', valor: activa ? `${String(activa.mes_activo).padStart(2, '0')}/${activa.ano_activo}` : '—',
      icono: '◷', tono: 'tone-amber',
    }));
    stats.appendChild(statCard({
      etiqueta: 'Cédula / RNC', valor: activa ? (activa.cedula_juridica || 'Sin asignar') : '—',
      icono: '▤', tono: 'tone-violet', small: true,
    }));

    tb.innerHTML = '';
    for (const c of comps) {
      const activaRow = c.id_compania === e.compania;
      const tr = el(`<tr>
        <td class="num font-mono"><strong>${c.id_compania}</strong></td>
        <td>
          <strong style="font-size:14px;">${c.razon_social}</strong>
          ${activaRow ? '<span class="tag tag-mayor" style="margin-left:8px; font-weight:800; background:#0f766e; color:#fff; padding:2px 8px; border-radius:4px;">ACTIVA GLOBALMENTE</span>' : ''}
        </td>
        <td style="font-family:var(--mono);">${c.cedula_juridica || '—'}</td>
        <td class="num font-mono">${String(c.mes_activo).padStart(2, '0')}/${c.ano_activo}</td>
        <td>
          <button class="btn ${activaRow ? 'btn-gris' : 'btn-primary'}" data-activar="${c.id_compania}" style="font-weight:700; padding:6px 14px;">
            ${activaRow ? '✅ Activa' : '⚡ Activar & Sincronizar'}
          </button>
        </td>
      </tr>`);

      tr.querySelector('button').addEventListener('click', async (ev) => {
        const id = Number(ev.currentTarget.dataset.activar);
        await sincronizarTodoElSistema(id);
        render();
      });

      tb.appendChild(tr);
    }
  });

  const form = el(`
    <div class="panel">
      <h2>Registrar Nueva Compañía</h2>
      <div class="form-grid">
        <div><label>Razón Social *</label><input id="nueva-razon" placeholder="Ej: JNJ Servicios Logísticos S.A."></div>
        <div><label>Cédula Jurídica / RNC</label><input id="nueva-cedula" placeholder="Ej: 3-101-554433"></div>
        <div><label>Mes Activo</label><input id="nueva-mes" type="number" min="1" max="12" value="${new Date().getMonth() + 1}"></div>
        <div><label>Año Activo</label><input id="nueva-ano" type="number" value="${new Date().getFullYear()}"></div>
      </div>
      <div class="toolbar" style="margin-top:14px;">
        <button class="btn btn-primary" id="nueva-btn" style="padding:10px 20px; font-weight:700;">➕ Guardar y Activar Compañía</button>
      </div>
    </div>`);
  contenido.appendChild(form);

  form.querySelector('#nueva-btn').addEventListener('click', async () => {
    const cuerpo = {
      razon_social: form.querySelector('#nueva-razon').value,
      cedula_juridica: form.querySelector('#nueva-cedula').value,
      mes_activo: Number(form.querySelector('#nueva-mes').value),
      ano_activo: Number(form.querySelector('#nueva-ano').value),
    };
    if (!cuerpo.razon_social) {
      mensaje(form, 'La razón social es obligatoria.', 'error');
      return;
    }
    try {
      const res = await POST('/api/companias', cuerpo);
      mensaje(form, 'Compañía creada exitosamente.', 'ok');
      await sincronizarTodoElSistema(res.id_compania);
      setTimeout(render, 300);
    } catch (err) {
      mensaje(form, err.message, 'error');
    }
  });
}

registrarModulo('companias', { render });