import { registrarModulo } from '../registro.js';
import { getEstado, mostrar } from '../app.js';
import { fmtMoneda } from '../ui.js';

export async function render() {
  const estado = getEstado();
  const el = document.getElementById('app-contenido');
  if (!estado.compania) {
    el.innerHTML = '<div class="msg msg-info">Seleccione una compañía para ver Cuentas por Cobrar.</div>';
    return;
  }

  const [cxc, clientes, bancos, recibos] = await Promise.all([
    (await fetch(`/api/cxc?compania=${estado.compania}`)).json(),
    (await fetch(`/api/clientes?compania=${estado.compania}`)).json(),
    (await fetch(`/api/bancos?compania=${estado.compania}`)).json(),
    (await fetch(`/api/cxc/recibos?compania=${estado.compania}`)).json()
  ]);

  const totalPendiente = cxc.reduce((acc, x) => acc + (x.estado !== 'PAGADA' ? x.saldo : 0), 0);

  el.innerHTML = `
    <div class="monica-cxc-layout" style="display:flex; flex-direction:column; gap:16px;">
      
      <!-- CABECERA -->
      <div class="panel" style="display:flex; justify-content:space-between; align-items:center; padding:18px 22px;">
        <div>
          <h3 style="margin:0; font-size:18px;">Cartera de Clientes & Cobranzas</h3>
          <p style="margin:4px 0 0 0; color:#64748b; font-size:13px;">Total saldo pendiente por cobrar: <strong style="color:#dc2626; font-family:var(--mono); font-size:15px;">${fmtMoneda(totalPendiente)}</strong></p>
        </div>
        <button class="btn btn-primary" id="btn-nuevo-recibo" style="padding:10px 18px; font-weight:700;">
          💵 Registrar Recibo de Caja / Cobro
        </button>
      </div>

      <!-- TABLA DE FACTURAS EN CARTERA -->
      <div class="panel">
        <div style="margin-bottom:12px;">
          <h3 style="margin:0; font-size:16px;">Facturas Pendientes de Cobro</h3>
        </div>
        <div class="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Factura</th>
                <th>Cliente</th>
                <th>Teléfono</th>
                <th>Fecha Emisión</th>
                <th>Vencimiento</th>
                <th class="num">Monto Total</th>
                <th class="num">Abonado</th>
                <th class="num">Saldo Pendiente</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              ${cxc.length === 0 ? '<tr><td colspan="9" class="vacio">No hay deudas pendientes en cartera.</td></tr>' : ''}
              ${cxc.map(c => `
                <tr>
                  <td><strong>${c.numero_factura}</strong></td>
                  <td>${c.cliente_nombre}</td>
                  <td>${c.telefono || '—'}</td>
                  <td>${c.fecha}</td>
                  <td>${c.fecha_vencimiento}</td>
                  <td class="num font-mono">${fmtMoneda(c.monto_total)}</td>
                  <td class="num font-mono">${fmtMoneda(c.monto_pagado)}</td>
                  <td class="num font-mono font-bold" style="color:${c.saldo > 0 ? '#dc2626' : '#15803d'}; font-size:14px;">
                    ${fmtMoneda(c.saldo)}
                  </td>
                  <td>
                    <span style="font-size:11px; font-weight:700; padding:2px 6px; border-radius:4px; background:${c.estado === 'PAGADA' ? '#dcfce7' : c.estado === 'PARCIAL' ? '#dbeafe' : '#fef3c7'}; color:${c.estado === 'PAGADA' ? '#15803d' : c.estado === 'PARCIAL' ? '#1d4ed8' : '#b45309'};">
                      ${c.estado}
                    </span>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>

      <!-- HISTORIAL DE RECIBOS DE CAJA -->
      <div class="panel">
        <div style="margin-bottom:12px;">
          <h3 style="margin:0; font-size:16px;">Recibos de Caja Emitidos (${recibos.length})</h3>
        </div>
        <div class="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Recibo #</th>
                <th>Fecha</th>
                <th>Cliente</th>
                <th>Cuenta Destino</th>
                <th class="num">Monto Cobrado</th>
                <th>Referencia</th>
                <th>Concepto</th>
              </tr>
            </thead>
            <tbody>
              ${recibos.length === 0 ? '<tr><td colspan="7" class="vacio">No hay recibos de caja emitidos.</td></tr>' : ''}
              ${recibos.map(r => `
                <tr>
                  <td><strong>${r.numero_recibo}</strong></td>
                  <td>${r.fecha}</td>
                  <td>${r.cliente_nombre}</td>
                  <td>${r.banco_nombre}</td>
                  <td class="num font-mono font-bold" style="color:#15803d; font-size:14px;">${fmtMoneda(r.monto)}</td>
                  <td>${r.referencia || '—'}</td>
                  <td>${r.concepto || ''}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  `;

  // Modal Crear Recibo de Caja
  el.querySelector('#btn-nuevo-recibo')?.addEventListener('click', () => {
    const modal = document.getElementById('modal');
    const tit = document.getElementById('modal-titulo');
    const cuerpo = document.getElementById('modal-cuerpo');

    tit.innerHTML = '<h3>Nuevo Recibo de Caja (Cobro de Facturas)</h3>';
    cuerpo.innerHTML = `
      <form id="form-nuevo-recibo" style="display:flex; flex-direction:column; gap:12px;">
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
          <div>
            <label style="display:block; font-size:12px; font-weight:700; color:#475569; margin-bottom:4px;">Cliente *</label>
            <select id="rc-cliente" required style="width:100%; padding:8px 12px; border-radius:8px; border:1px solid #cbd5e1;">
              <option value="">-- Seleccione Cliente --</option>
              ${clientes.filter(c => c.saldo_actual > 0).map(c => `<option value="${c.id_cliente}">${c.nombre} (Deuda: ${fmtMoneda(c.saldo_actual)})</option>`).join('')}
            </select>
          </div>
          <div>
            <label style="display:block; font-size:12px; font-weight:700; color:#475569; margin-bottom:4px;">Cuenta Bancaria / Caja *</label>
            <select id="rc-banco" required style="width:100%; padding:8px 12px; border-radius:8px; border:1px solid #cbd5e1;">
              ${bancos.map(b => `<option value="${b.id_banco}">${b.nombre} (Saldo: ${fmtMoneda(b.saldo_actual)})</option>`).join('')}
            </select>
          </div>
        </div>

        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
          <div>
            <label style="display:block; font-size:12px; font-weight:700; color:#475569; margin-bottom:4px;">Monto del Cobro / Abono ($) *</label>
            <input type="number" id="rc-monto" required min="0.01" step="0.01" placeholder="0.00" style="width:100%; padding:8px 12px; border-radius:8px; border:1px solid #cbd5e1; font-family:var(--mono); font-weight:700;">
          </div>
          <div>
            <label style="display:block; font-size:12px; font-weight:700; color:#475569; margin-bottom:4px;">Fecha del Pago</label>
            <input type="date" id="rc-fecha" value="${new Date().toISOString().split('T')[0]}" style="width:100%; padding:8px 12px; border-radius:8px; border:1px solid #cbd5e1;">
          </div>
        </div>

        <div>
          <label style="display:block; font-size:12px; font-weight:700; color:#475569; margin-bottom:4px;">Número de Referencia / Transferencia</label>
          <input type="text" id="rc-ref" placeholder="Transf. BAC #889922" style="width:100%; padding:8px 12px; border-radius:8px; border:1px solid #cbd5e1;">
        </div>

        <div>
          <label style="display:block; font-size:12px; font-weight:700; color:#475569; margin-bottom:4px;">Concepto / Glosa</label>
          <input type="text" id="rc-concepto" value="Abono a facturas pendientes" style="width:100%; padding:8px 12px; border-radius:8px; border:1px solid #cbd5e1;">
        </div>

        <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:14px;">
          <button type="button" class="btn btn-secondary" onclick="document.getElementById('modal').classList.add('hidden')">Cancelar</button>
          <button type="submit" class="btn btn-primary">Emitir Recibo y Asentar</button>
        </div>
      </form>
    `;

    modal.classList.remove('hidden');

    document.getElementById('form-nuevo-recibo').addEventListener('submit', async (e) => {
      e.preventDefault();
      const cliId = Number(document.getElementById('rc-cliente').value);
      const bancoId = Number(document.getElementById('rc-banco').value);
      const monto = Number(document.getElementById('rc-monto').value);

      if (!cliId) {
        alert('Seleccione un cliente con saldo pendiente.');
        return;
      }

      const cxcCli = cxc.filter(x => x.id_cliente === cliId && x.estado !== 'PAGADA');
      let restante = monto;
      const aplicaciones = [];

      for (const f of cxcCli) {
        if (restante <= 0) break;
        const abono = Math.min(restante, f.saldo);
        aplicaciones.push({ id_cxc: f.id_cxc, monto: abono });
        restante -= abono;
      }

      const payload = {
        id_compania: estado.compania,
        id_cliente: cliId,
        id_banco: bancoId,
        fecha: document.getElementById('rc-fecha').value,
        monto,
        referencia: document.getElementById('rc-ref').value,
        concepto: document.getElementById('rc-concepto').value,
        aplicaciones
      };

      const res = await fetch('/api/cxc/recibo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        const data = await res.json();
        alert(`¡Recibo de Caja #${data.numero_recibo} registrado exitosamente!`);
        modal.classList.add('hidden');
        render();
      } else {
        const err = await res.json();
        alert(`Error: ${err.error}`);
      }
    });
  });
}

registrarModulo('cxc', { render });
