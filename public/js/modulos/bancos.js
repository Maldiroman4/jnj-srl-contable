import { registrarModulo } from '../registro.js';
import { getEstado, mostrar } from '../app.js';
import { fmtMoneda } from '../ui.js';

export async function render() {
  const estado = getEstado();
  const el = document.getElementById('app-contenido');
  if (!estado.compania) {
    el.innerHTML = '<div class="msg msg-info">Seleccione una compañía para ver Tesorería.</div>';
    return;
  }

  const bancos = await (await fetch(`/api/bancos?compania=${estado.compania}`)).json();
  const totalLiquidez = bancos.reduce((acc, b) => acc + b.saldo_actual, 0);

  el.innerHTML = `
    <div class="monica-bancos-layout" style="display:flex; flex-direction:column; gap:16px;">
      
      <div class="panel" style="display:flex; justify-content:space-between; align-items:center; padding:18px 22px;">
        <div>
          <h3 style="margin:0; font-size:18px;">Cuentas Bancarias & Cajas (${bancos.length})</h3>
          <p style="margin:4px 0 0 0; color:#64748b; font-size:13px;">Disponibilidad total en efectivo y bancos: <strong style="color:#15803d; font-family:var(--mono); font-size:15px;">${fmtMoneda(totalLiquidez)}</strong></p>
        </div>
        <button class="btn btn-primary" id="btn-nueva-cuenta-banco" style="padding:10px 18px; font-weight:700;">
          ➕ Nueva Cuenta Bancaria / Caja
        </button>
      </div>

      <div class="panel">
        <div class="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Código</th>
                <th>Nombre de la Cuenta / Caja</th>
                <th>Número de Cuenta / IBAN</th>
                <th>Cuenta Contable Asociada</th>
                <th class="num">Saldo Actual</th>
              </tr>
            </thead>
            <tbody>
              ${bancos.map(b => `
                <tr>
                  <td><span style="font-family:var(--mono); font-weight:700; background:#f1f5f9; padding:2px 8px; border-radius:4px;">${b.codigo}</span></td>
                  <td><strong>${b.nombre}</strong></td>
                  <td style="font-family:var(--mono);">${b.numero_cuenta || '—'}</td>
                  <td><span style="font-family:var(--mono); color:#64748b;">${b.id_cuenta_contable || '11001001'}</span></td>
                  <td class="num font-mono font-bold" style="color:#15803d; font-size:15px;">
                    ${fmtMoneda(b.saldo_actual)}
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  `;

  // Modal Crear Cuenta de Banco
  el.querySelector('#btn-nueva-cuenta-banco')?.addEventListener('click', () => {
    const modal = document.getElementById('modal');
    const tit = document.getElementById('modal-titulo');
    const cuerpo = document.getElementById('modal-cuerpo');

    tit.innerHTML = '<h3>Nueva Cuenta Bancaria / Caja</h3>';
    cuerpo.innerHTML = `
      <form id="form-nuevo-banco" style="display:flex; flex-direction:column; gap:12px;">
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
          <div>
            <label style="display:block; font-size:12px; font-weight:700; color:#475569; margin-bottom:4px;">Código *</label>
            <input type="text" id="nb-codigo" required placeholder="BCO-03" style="width:100%; padding:8px 12px; border-radius:8px; border:1px solid #cbd5e1;">
          </div>
          <div>
            <label style="display:block; font-size:12px; font-weight:700; color:#475569; margin-bottom:4px;">Nombre de la Cuenta *</label>
            <input type="text" id="nb-nombre" required placeholder="Banco Nacional Cta. Ahorros" style="width:100%; padding:8px 12px; border-radius:8px; border:1px solid #cbd5e1;">
          </div>
        </div>

        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
          <div>
            <label style="display:block; font-size:12px; font-weight:700; color:#475569; margin-bottom:4px;">Número de Cuenta / IBAN</label>
            <input type="text" id="nb-numero" placeholder="CR0501510000..." style="width:100%; padding:8px 12px; border-radius:8px; border:1px solid #cbd5e1;">
          </div>
          <div>
            <label style="display:block; font-size:12px; font-weight:700; color:#475569; margin-bottom:4px;">Saldo Inicial ($)</label>
            <input type="number" id="nb-saldo" value="0" step="0.01" style="width:100%; padding:8px 12px; border-radius:8px; border:1px solid #cbd5e1; font-family:var(--mono);">
          </div>
        </div>

        <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:14px;">
          <button type="button" class="btn btn-secondary" onclick="document.getElementById('modal').classList.add('hidden')">Cancelar</button>
          <button type="submit" class="btn btn-primary">Guardar Cuenta</button>
        </div>
      </form>
    `;

    modal.classList.remove('hidden');

    document.getElementById('form-nuevo-banco').addEventListener('submit', async (e) => {
      e.preventDefault();
      const payload = {
        id_compania: estado.compania,
        codigo: document.getElementById('nb-codigo').value,
        nombre: document.getElementById('nb-nombre').value,
        numero_cuenta: document.getElementById('nb-numero').value,
        saldo_actual: Number(document.getElementById('nb-saldo').value)
      };

      const res = await fetch('/api/bancos', {
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
}

registrarModulo('bancos', { render });
