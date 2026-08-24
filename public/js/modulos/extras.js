import { registrarModulo } from '../registro.js';
import { el, paginaHeader } from '../ui.js';
import { mostrar, getEstado } from '../app.js';

export function render() {
  const e = getEstado();
  const contenido = document.getElementById('app-contenido');
  contenido.innerHTML = '';

  contenido.appendChild(paginaHeader('Módulos Comerciales & Extras',
    'Herramientas auxiliares y operativas complementarias al motor de contabilidad pura.',
    `MÓDULOS ADICIONALES · COMPAÑÍA ${e.compania || 24}`));

  const panel = el(`
    <div class="extras-grid" style="display:grid; grid-template-columns:repeat(auto-fit, minmax(280px, 1fr)); gap:18px;">
      
      <!-- Facturación POS -->
      <div class="panel extra-card" data-modulo="facturacion" style="cursor:pointer; transition:all .2s var(--ease-apple); margin-bottom:0; display:flex; flex-direction:column; justify-content:space-between;">
        <div>
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
            <span style="font-size:28px;">🧾</span>
            <span class="tag" style="background:var(--blue-50); color:var(--primary); font-weight:700;">Comercial</span>
          </div>
          <h2 style="font-size:16px; margin-bottom:6px; padding-bottom:0; border-bottom:none;">Facturación Rápida (POS)</h2>
          <p style="font-size:13px; color:var(--muted); margin-bottom:14px;">Emisión de facturas de venta, condiciones contado/crédito y generación de comprobantes.</p>
        </div>
        <button class="btn btn-primary btn-sm" style="align-self:flex-start;">Abrir Facturación →</button>
      </div>

      <!-- Inventario & Kárdex -->
      <div class="panel extra-card" data-modulo="inventario" style="cursor:pointer; transition:all .2s var(--ease-apple); margin-bottom:0; display:flex; flex-direction:column; justify-content:space-between;">
        <div>
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
            <span style="font-size:28px;">📦</span>
            <span class="tag" style="background:var(--blue-50); color:var(--primary); font-weight:700;">Stock & CPP</span>
          </div>
          <h2 style="font-size:16px; margin-bottom:6px; padding-bottom:0; border-bottom:none;">Inventario & Kárdex</h2>
          <p style="font-size:13px; color:var(--muted); margin-bottom:14px;">Control de existencias, código CAByS, costo promedio ponderado y movimientos de almacén.</p>
        </div>
        <button class="btn btn-primary btn-sm" style="align-self:flex-start;">Abrir Inventario →</button>
      </div>

      <!-- Directorio de Clientes -->
      <div class="panel extra-card" data-modulo="clientes" style="cursor:pointer; transition:all .2s var(--ease-apple); margin-bottom:0; display:flex; flex-direction:column; justify-content:space-between;">
        <div>
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
            <span style="font-size:28px;">👥</span>
            <span class="tag" style="background:var(--blue-50); color:var(--primary); font-weight:700;">Cartera</span>
          </div>
          <h2 style="font-size:16px; margin-bottom:6px; padding-bottom:0; border-bottom:none;">Clientes & Contactos</h2>
          <p style="font-size:13px; color:var(--muted); margin-bottom:14px;">Directorio de clientes, cédulas jurídicas/físicas, límites de crédito y plazos de pago.</p>
        </div>
        <button class="btn btn-primary btn-sm" style="align-self:flex-start;">Abrir Clientes →</button>
      </div>

      <!-- Cuentas por Cobrar -->
      <div class="panel extra-card" data-modulo="cxc" style="cursor:pointer; transition:all .2s var(--ease-apple); margin-bottom:0; display:flex; flex-direction:column; justify-content:space-between;">
        <div>
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
            <span style="font-size:28px;">💵</span>
            <span class="tag" style="background:var(--blue-50); color:var(--primary); font-weight:700;">Cobranza</span>
          </div>
          <h2 style="font-size:16px; margin-bottom:6px; padding-bottom:0; border-bottom:none;">Cuentas por Cobrar & Recibos</h2>
          <p style="font-size:13px; color:var(--muted); margin-bottom:14px;">Gestión de cobros pendientes, recibos de caja y aplicación de pagos a facturas.</p>
        </div>
        <button class="btn btn-primary btn-sm" style="align-self:flex-start;">Abrir CxC →</button>
      </div>

      <!-- Bancos & Tesorería -->
      <div class="panel extra-card" data-modulo="bancos" style="cursor:pointer; transition:all .2s var(--ease-apple); margin-bottom:0; display:flex; flex-direction:column; justify-content:space-between;">
        <div>
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
            <span style="font-size:28px;">🏦</span>
            <span class="tag" style="background:var(--blue-50); color:var(--primary); font-weight:700;">Tesorería</span>
          </div>
          <h2 style="font-size:16px; margin-bottom:6px; padding-bottom:0; border-bottom:none;">Bancos & Cajas</h2>
          <p style="font-size:13px; color:var(--muted); margin-bottom:14px;">Cuentas corrientes bancarias, cajas de mostrador y enlace con cuentas contables.</p>
        </div>
        <button class="btn btn-primary btn-sm" style="align-self:flex-start;">Abrir Bancos →</button>
      </div>

      <!-- Seguridad & Auditoría -->
      <div class="panel extra-card" data-modulo="seguridad" style="cursor:pointer; transition:all .2s var(--ease-apple); margin-bottom:0; display:flex; flex-direction:column; justify-content:space-between;">
        <div>
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
            <span style="font-size:28px;">🛡️</span>
            <span class="tag" style="background:var(--blue-50); color:var(--primary); font-weight:700;">Super User</span>
          </div>
          <h2 style="font-size:16px; margin-bottom:6px; padding-bottom:0; border-bottom:none;">Seguridad & Auditoría</h2>
          <p style="font-size:13px; color:var(--muted); margin-bottom:14px;">Monitoreo de accesos, dispositivos, direcciones IP, ubicaciones y datos cargados en BD.</p>
        </div>
        <button class="btn btn-primary btn-sm" style="align-self:flex-start;">Abrir Seguridad →</button>
      </div>

    </div>
  `);

  panel.querySelectorAll('.extra-card').forEach(card => {
    card.addEventListener('click', () => {
      const mod = card.dataset.modulo;
      if (mod) mostrar(mod);
    });
  });

  contenido.appendChild(panel);
}

registrarModulo('extras', { render });
