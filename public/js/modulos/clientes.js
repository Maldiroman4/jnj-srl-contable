import { registrarModulo } from '../registro.js';
import { getEstado, mostrar } from '../app.js';
import { fmtMoneda } from '../ui.js';
import { exportarElementoAPDF } from '../pdf-export.js';

export async function render() {
  const estado = getEstado();
  const el = document.getElementById('app-contenido');
  if (!estado.compania) {
    el.innerHTML = '<div class="msg msg-info">Seleccione una compañía para ver los clientes.</div>';
    return;
  }

  const clientes = await (await fetch(`/api/clientes?compania=${estado.compania}`)).json();

  el.innerHTML = `
    <div class="monica-clientes-layout" style="display:flex; flex-direction:column; gap:16px;">
      
      <div class="panel" style="display:flex; justify-content:space-between; align-items:center; padding:18px 22px;">
        <div>
          <h3 style="margin:0; font-size:18px;">Directorio de Clientes (${clientes.length})</h3>
          <p style="margin:4px 0 0 0; color:#64748b; font-size:13px;">Administración de terceros, créditos y estados de cuenta</p>
        </div>
        <button class="btn btn-primary" id="btn-nuevo-cliente" style="padding:10px 18px; font-weight:700;">
          ➕ Crear Cliente
        </button>
      </div>

      <div class="panel">
        <div class="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Código</th>
                <th>Nombre / Razón Social</th>
                <th>Cédula / RNC</th>
                <th>Teléfono</th>
                <th>Email</th>
                <th class="num">Límite Crédito</th>
                <th class="num">Saldo Deudor</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              ${clientes.map(c => `
                <tr>
                  <td><span style="font-family:var(--mono); font-weight:700; background:#f1f5f9; padding:2px 8px; border-radius:4px;">${c.codigo}</span></td>
                  <td><strong>${c.nombre}</strong></td>
                  <td>${c.cedula_rnc || '—'}</td>
                  <td>${c.telefono || '—'}</td>
                  <td>${c.email || '—'}</td>
                  <td class="num font-mono">${fmtMoneda(c.limite_credito)}</td>
                  <td class="num font-mono font-bold" style="color:${c.saldo_actual > 0 ? '#dc2626' : '#15803d'}; font-size:14px;">
                    ${fmtMoneda(c.saldo_actual)}
                  </td>
                  <td>
                    <button class="btn btn-sm btn-estado-cuenta" data-id="${c.id_cliente}" style="padding:4px 8px; font-size:12px;">
                      📑 Estado Cuenta
                    </button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  `;

  // Modal Crear Cliente
  el.querySelector('#btn-nuevo-cliente')?.addEventListener('click', () => {
    const modal = document.getElementById('modal');
    const tit = document.getElementById('modal-titulo');
    const cuerpo = document.getElementById('modal-cuerpo');

    tit.innerHTML = '<h3>Nuevo Cliente</h3>';
    cuerpo.innerHTML = `
      <form id="form-nuevo-cli" style="display:flex; flex-direction:column; gap:12px;">
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
          <div>
            <label style="display:block; font-size:12px; font-weight:700; color:#475569; margin-bottom:4px;">Código *</label>
            <input type="text" id="nc-codigo" required placeholder="CLI-005" style="width:100%; padding:8px 12px; border-radius:8px; border:1px solid #cbd5e1;">
          </div>
          <div>
            <label style="display:block; font-size:12px; font-weight:700; color:#475569; margin-bottom:4px;">Cédula Jurídica / RNC / NIT</label>
            <input type="text" id="nc-rnc" placeholder="3-101-998877" style="width:100%; padding:8px 12px; border-radius:8px; border:1px solid #cbd5e1;">
          </div>
        </div>

        <div>
          <label style="display:block; font-size:12px; font-weight:700; color:#475569; margin-bottom:4px;">Nombre o Razón Social *</label>
          <input type="text" id="nc-nombre" required placeholder="Transportes del Valle S.A." style="width:100%; padding:8px 12px; border-radius:8px; border:1px solid #cbd5e1;">
        </div>

        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
          <div>
            <label style="display:block; font-size:12px; font-weight:700; color:#475569; margin-bottom:4px;">Teléfono</label>
            <input type="text" id="nc-tel" placeholder="2233-4455" style="width:100%; padding:8px 12px; border-radius:8px; border:1px solid #cbd5e1;">
          </div>
          <div>
            <label style="display:block; font-size:12px; font-weight:700; color:#475569; margin-bottom:4px;">Email</label>
            <input type="email" id="nc-email" placeholder="facturacion@empresa.com" style="width:100%; padding:8px 12px; border-radius:8px; border:1px solid #cbd5e1;">
          </div>
        </div>

        <div>
          <label style="display:block; font-size:12px; font-weight:700; color:#475569; margin-bottom:4px;">Dirección</label>
          <input type="text" id="nc-dir" placeholder="San José, Costa Rica" style="width:100%; padding:8px 12px; border-radius:8px; border:1px solid #cbd5e1;">
        </div>

        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
          <div>
            <label style="display:block; font-size:12px; font-weight:700; color:#475569; margin-bottom:4px;">Límite de Crédito ($)</label>
            <input type="number" id="nc-limite" value="1000000" step="10000" style="width:100%; padding:8px 12px; border-radius:8px; border:1px solid #cbd5e1;">
          </div>
          <div>
            <label style="display:block; font-size:12px; font-weight:700; color:#475569; margin-bottom:4px;">Días de Crédito</label>
            <input type="number" id="nc-dias" value="30" step="1" style="width:100%; padding:8px 12px; border-radius:8px; border:1px solid #cbd5e1;">
          </div>
        </div>

        <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:14px;">
          <button type="button" class="btn btn-secondary" onclick="document.getElementById('modal').classList.add('hidden')">Cancelar</button>
          <button type="submit" class="btn btn-primary">Guardar Cliente</button>
        </div>
      </form>
    `;

    modal.classList.remove('hidden');

    document.getElementById('form-nuevo-cli').addEventListener('submit', async (e) => {
      e.preventDefault();
      const payload = {
        id_compania: estado.compania,
        codigo: document.getElementById('nc-codigo').value,
        nombre: document.getElementById('nc-nombre').value,
        cedula_rnc: document.getElementById('nc-rnc').value,
        telefono: document.getElementById('nc-tel').value,
        email: document.getElementById('nc-email').value,
        direccion: document.getElementById('nc-dir').value,
        limite_credito: Number(document.getElementById('nc-limite').value),
        dias_credito: Number(document.getElementById('nc-dias').value)
      };

      const res = await fetch('/api/clientes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        modal.classList.add('hidden');
        render();
      } else {
        const err = await res.json();
        alert(`Error: ${err.error}`);
      }
    });
  });

  // Ver Estado de Cuenta
  el.querySelectorAll('.btn-estado-cuenta').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      const res = await (await fetch(`/api/clientes/${id}/estado-cuenta`)).json();
      const c = res.cliente;
      const facturas = res.facturasPendientes;

      const modal = document.getElementById('modal');
      const tit = document.getElementById('modal-titulo');
      const cuerpo = document.getElementById('modal-cuerpo');

      tit.innerHTML = `<h3>Estado de Cuenta: ${c.nombre}</h3>`;
      cuerpo.innerHTML = `
        <div id="estado-cuenta-pdf-contenedor" style="display:flex; flex-direction:column; gap:14px; padding:10px; background:#fff;">
          <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:2px solid #0f766e; padding-bottom:8px;">
            <div style="display:flex; align-items:center; gap:10px;">
              <img src="img/logo.png" alt="Logo JNJ" style="width:40px; height:40px; object-fit:contain; border-radius:8px;">
              <div>
                <h3 style="margin:0; font-size:16px;">Estado de Cuenta: ${c.nombre}</h3>
                <p style="margin:0; font-size:12px; color:#64748b;">RNC/Cédula: ${c.cedula_rnc || 'N/A'}</p>
              </div>
            </div>
            <div style="text-align:right;">
              <span style="font-size:12px; color:#64748b;">Fecha de emisión:</span><br>
              <strong>${new Date().toISOString().split('T')[0]}</strong>
            </div>
          </div>

          <div style="display:flex; justify-content:space-between; background:#f8fafc; border:1px solid #e2e8f0; padding:12px 16px; border-radius:8px; font-size:13px;">
            <div><strong>Límite Crédito:</strong> ${fmtMoneda(c.limite_credito)}</div>
            <div><strong>Saldo Pendiente:</strong> <span style="font-weight:700; color:#dc2626;">${fmtMoneda(c.saldo_actual)}</span></div>
            <div><strong>Días Crédito:</strong> ${c.dias_credito} días</div>
          </div>

          <h4 style="margin:6px 0 0 0;">Facturas Pendientes de Cobro</h4>
          <div class="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Factura</th>
                  <th>Fecha Emisión</th>
                  <th>Vencimiento</th>
                  <th class="num">Monto Total</th>
                  <th class="num">Abonado</th>
                  <th class="num">Saldo Deudor</th>
                </tr>
              </thead>
              <tbody>
                ${facturas.length === 0 ? '<tr><td colspan="6" class="vacio">No posee facturas pendientes de pago.</td></tr>' : ''}
                ${facturas.map(f => `
                  <tr>
                    <td><strong>${f.numero_factura}</strong></td>
                    <td>${f.fecha}</td>
                    <td>${f.fecha_vencimiento}</td>
                    <td class="num font-mono">${fmtMoneda(f.monto_total)}</td>
                    <td class="num font-mono">${fmtMoneda(f.monto_pagado)}</td>
                    <td class="num font-mono font-bold" style="color:#dc2626;">${fmtMoneda(f.saldo)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>

        <div style="margin-top:16px; display:flex; justify-content:center;">
          <button class="btn btn-primary" id="btn-descargar-cta-pdf" style="padding:10px 22px; font-weight:700; border-radius:8px;">
            📥 Descargar Estado de Cuenta en PDF
          </button>
        </div>
      `;
      modal.classList.remove('hidden');

      document.getElementById('btn-descargar-cta-pdf')?.addEventListener('click', async () => {
        const btn = document.getElementById('btn-descargar-cta-pdf');
        const orig = btn.textContent;
        btn.textContent = '⏳ Generando PDF...';
        btn.disabled = true;
        try {
          await exportarElementoAPDF(document.getElementById('estado-cuenta-pdf-contenedor'), {
            nombreArchivo: `EstadoCuenta_${c.codigo}.pdf`,
            formato: 'letter'
          });
        } finally {
          btn.textContent = orig;
          btn.disabled = false;
        }
      });
    });
  });
}

registrarModulo('clientes', { render });
