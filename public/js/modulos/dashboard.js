import { registrarModulo } from '../registro.js';
import { getEstado, mostrar } from '../app.js';
import { fmtMoneda } from '../ui.js';

export async function render() {
  const estado = getEstado();
  const el = document.getElementById('app-contenido');
  if (!estado.compania) {
    el.innerHTML = '<div class="msg msg-info">Seleccione una compañía para ver las métricas.</div>';
    return;
  }

  try {
    const data = await (await fetch(`/api/dashboard/stats?compania=${estado.compania}`)).json();
    const k = data.kpis || {};
    const compActual = estado.companias.find(c => c.id_compania === Number(estado.compania));
    const compNombre = compActual?.razon_social || 'JNJ SRL';

    el.innerHTML = `
      <div class="monica-dashboard" style="display:flex; flex-direction:column; gap:18px;">
        
        <!-- HEADER PRINCIPAL / GREETING BAR -->
        <div class="panel dashboard-hero" style="margin-bottom:0; padding:20px 24px; border-radius:var(--radius-lg); background:linear-gradient(135deg, #0a192f 0%, #0d2744 60%, #1e40af 100%); color:#ffffff; border:1px solid rgba(56,189,248,0.25); box-shadow:0 8px 24px rgba(10,25,47,0.25);">
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:14px;">
            <div style="display:flex; align-items:center; gap:14px;">
              <img src="img/logo.png" alt="Logo JNJ SRL" style="width:44px; height:44px; object-fit:contain; border-radius:10px; box-shadow:0 4px 14px rgba(2,132,199,0.5); border:1.5px solid rgba(56,189,248,0.4); flex-shrink:0;">
              <div>
                <div style="display:inline-flex; align-items:center; gap:6px; font-size:11px; font-weight:700; background:rgba(2,132,199,0.3); color:#7dd3fc; padding:2px 8px; border-radius:var(--radius-full); margin-bottom:4px;">
                  <span>🏢</span> ${compNombre}
                </div>
                <h1 style="color:#ffffff; font-size:20px; font-weight:800; letter-spacing:-0.03em; margin:0;">Tablero Principal</h1>
              </div>
            </div>

            <!-- Botones de Acción Rápida -->
            <div class="dashboard-quick-actions" style="display:flex; gap:8px; flex-wrap:wrap;">
              <button class="btn btn-primary" id="btn-quick-factura" style="padding:8px 16px; font-size:13px; font-weight:700; border-radius:var(--radius-sm);">
                <span>🧾</span> Facturar (POS)
              </button>
              <button class="btn" id="btn-quick-recibo" style="background:rgba(255,255,255,0.12); color:#ffffff; backdrop-filter:blur(8px); border:1px solid rgba(255,255,255,0.2); font-size:13px; font-weight:600; padding:8px 14px; border-radius:var(--radius-sm);">
                <span>💵</span> Recibo
              </button>
              <button class="btn" id="btn-quick-producto" style="background:rgba(255,255,255,0.12); color:#ffffff; backdrop-filter:blur(8px); border:1px solid rgba(255,255,255,0.2); font-size:13px; font-weight:600; padding:8px 14px; border-radius:var(--radius-sm);">
                <span>📦</span> Artículo
              </button>
            </div>
          </div>
        </div>

        <!-- 4 TARJETAS KPI (Apple Bento Grid) -->
        <div class="dashboard-kpi-grid" style="display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:14px;">
          
          <!-- Ventas -->
          <div class="panel stat-bento" style="padding:18px 20px; border-radius:var(--radius-md); margin-bottom:0;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <span style="color:var(--muted); font-size:11.5px; font-weight:700; text-transform:uppercase; letter-spacing:.03em;">Ventas del Mes</span>
              <span style="display:grid; place-items:center; width:34px; height:34px; border-radius:var(--radius-sm); background:var(--blue-50); color:var(--primary); font-size:16px;">💳</span>
            </div>
            <div style="font-size:22px; font-weight:800; font-family:var(--mono); color:var(--ink); margin:8px 0 2px; letter-spacing:-0.03em;">
              ${fmtMoneda(k.totalVentas || 0)}
            </div>
            <div style="font-size:12px; color:var(--muted);">
              <strong>${k.cantFacturas || 0}</strong> facturas emitidas
            </div>
          </div>

          <!-- CxC -->
          <div class="panel stat-bento" style="padding:18px 20px; border-radius:var(--radius-md); margin-bottom:0;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <span style="color:var(--muted); font-size:11.5px; font-weight:700; text-transform:uppercase; letter-spacing:.03em;">Cuentas por Cobrar</span>
              <span style="display:grid; place-items:center; width:34px; height:34px; border-radius:var(--radius-sm); background:var(--warn-soft); color:var(--warn); font-size:16px;">📋</span>
            </div>
            <div style="font-size:22px; font-weight:800; font-family:var(--mono); color:var(--ink); margin:8px 0 2px; letter-spacing:-0.03em;">
              ${fmtMoneda(k.totalCxC || 0)}
            </div>
            <div style="font-size:12px; color:${(k.cxcVencida || 0) > 0 ? 'var(--danger)' : 'var(--ok)'}; font-weight:600;">
              ${fmtMoneda(k.cxcVencida || 0)} vencidas
            </div>
          </div>

          <!-- Inventario -->
          <div class="panel stat-bento" style="padding:18px 20px; border-radius:var(--radius-md); margin-bottom:0;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <span style="color:var(--muted); font-size:11.5px; font-weight:700; text-transform:uppercase; letter-spacing:.03em;">Valor Inventario</span>
              <span style="display:grid; place-items:center; width:34px; height:34px; border-radius:var(--radius-sm); background:var(--accent-indigo-soft); color:var(--accent-indigo); font-size:16px;">📦</span>
            </div>
            <div style="font-size:22px; font-weight:800; font-family:var(--mono); color:var(--ink); margin:8px 0 2px; letter-spacing:-0.03em;">
              ${fmtMoneda(k.valorInventario || 0)}
            </div>
            <div style="font-size:12px; color:var(--muted);">
              <strong>${k.totalProductos || 0}</strong> artículos en kárdex
            </div>
          </div>

          <!-- Bancos -->
          <div class="panel stat-bento" style="padding:18px 20px; border-radius:var(--radius-md); margin-bottom:0;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <span style="color:var(--muted); font-size:11.5px; font-weight:700; text-transform:uppercase; letter-spacing:.03em;">Bancos & Caja</span>
              <span style="display:grid; place-items:center; width:34px; height:34px; border-radius:var(--radius-sm); background:var(--ok-soft); color:var(--ok); font-size:16px;">🏦</span>
            </div>
            <div style="font-size:22px; font-weight:800; font-family:var(--mono); color:#065f46; margin:8px 0 2px; letter-spacing:-0.03em;">
              ${fmtMoneda(k.totalBancos || 0)}
            </div>
            <div style="font-size:12px; color:var(--muted);">
              Liquidez disponible
            </div>
          </div>

        </div>

        <!-- DOS COLUMNAS: ÚLTIMAS VENTAS Y ALERTAS DE STOCK -->
        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(300px, 1fr)); gap:18px;">
          
          <div class="panel" style="margin-bottom:0;">
            <h2>Últimas Facturas Emitidas</h2>
            <div class="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Factura</th>
                    <th>Cliente</th>
                    <th>Fecha</th>
                    <th>Condición</th>
                    <th class="num">Monto</th>
                  </tr>
                </thead>
                <tbody>
                  ${(data.ultimasFacturas || []).length === 0 ? '<tr><td colspan="5" class="vacio">No hay facturas emitidas este mes.</td></tr>' : ''}
                  ${(data.ultimasFacturas || []).map(f => `
                    <tr>
                      <td><strong style="color:var(--primary); font-family:var(--mono);">${f.numero_factura}</strong></td>
                      <td>${f.cliente_nombre}</td>
                      <td style="color:var(--muted); font-size:12px;">${f.fecha}</td>
                      <td>
                        <span class="tag" style="background:${f.tipo_pago === 'CONTADO' ? 'var(--ok-soft)' : 'var(--warn-soft)'}; color:${f.tipo_pago === 'CONTADO' ? '#065f46' : 'var(--warn)'};">
                          ${f.tipo_pago}
                        </span>
                      </td>
                      <td class="num font-mono font-bold">${fmtMoneda(f.total)}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>

          <div class="panel" style="margin-bottom:0;">
            <h2>Alertas de Stock Bajo</h2>
            <div class="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Artículo</th>
                    <th class="num">Stock</th>
                    <th class="num">Mínimo</th>
                  </tr>
                </thead>
                <tbody>
                  ${(data.bajoStock || []).length === 0 ? '<tr><td colspan="3" class="vacio" style="color:var(--ok); font-weight:600;">✅ Todo el inventario sobre el mínimo.</td></tr>' : ''}
                  ${(data.bajoStock || []).map(p => `
                    <tr>
                      <td>
                        <strong>${p.descripcion}</strong>
                        <br><small style="color:var(--muted); font-family:var(--mono);">SKU: ${p.codigo}</small>
                      </td>
                      <td class="num font-bold" style="color:var(--danger); font-size:15px;">${p.stock_actual}</td>
                      <td class="num font-mono" style="color:var(--muted);">${p.stock_minimo}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>

        </div>

      </div>
    `;

    // Eventos de botones rápidos
    el.querySelector('#btn-quick-factura')?.addEventListener('click', () => mostrar('facturacion'));
    el.querySelector('#btn-quick-recibo')?.addEventListener('click', () => mostrar('cxc'));
    el.querySelector('#btn-quick-producto')?.addEventListener('click', () => mostrar('inventario'));

  } catch (e) {
    el.innerHTML = `<div class="msg msg-error">Error al cargar el Tablero: ${e.message}</div>`;
  }
}

registrarModulo('dashboard', { render });
