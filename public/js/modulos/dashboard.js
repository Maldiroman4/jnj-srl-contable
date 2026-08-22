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

    el.innerHTML = `
      <div class="monica-dashboard" style="display:flex; flex-direction:column; gap:22px;">
        
        <!-- HERO BANNER JNJ SRL (Deep Ocean & Electric Azure Gradient) -->
        <div class="panel" style="background:linear-gradient(135deg, #0a192f 0%, #0f2b48 50%, #1e40af 100%); color:#ffffff; border-radius:var(--radius-xl); padding:28px 32px; box-shadow:0 14px 34px -8px rgba(10, 25, 47, 0.4); border:1px solid rgba(56, 189, 248, 0.2);">
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:20px;">
            <div style="display:flex; align-items:center; gap:20px;">
              <img src="img/logo.png" alt="Logo JNJ SRL" style="width:64px; height:64px; object-fit:contain; border-radius:var(--radius-md); box-shadow:0 8px 24px rgba(2,132,199,0.4); border:2px solid rgba(56,189,248,0.4);">
              <div>
                <div style="display:inline-flex; align-items:center; font-size:11px; font-weight:700; background:rgba(2, 132, 199, 0.35); color:#7dd3fc; padding:3px 12px; border-radius:var(--radius-full); text-transform:uppercase; margin-bottom:8px; border:1px solid rgba(125, 211, 252, 0.35);">
                  Cupertino Blue 2.0 · JNJ SRL
                </div>
                <h2 style="color:#ffffff; font-size:26px; margin:0 0 6px 0; letter-spacing:-0.03em;">Panel de Control Integral</h2>
                <p style="color:#94a3b8; font-size:14px; margin:0; letter-spacing:-0.01em;">Facturación POS, Kárdex con CPP, Cuentas por Cobrar, Tesorería y Contabilidad en tiempo real.</p>
              </div>
            </div>
            <div style="display:flex; gap:10px; flex-wrap:wrap;">
              <button class="btn btn-primary" id="btn-quick-factura" style="padding:11px 20px; font-weight:700; border-radius:var(--radius-md);">
                🧾 Facturar (POS)
              </button>
              <button class="btn" id="btn-quick-recibo" style="background:rgba(255,255,255,0.12); color:#ffffff; backdrop-filter:blur(10px); border:1px solid rgba(255,255,255,0.2); font-weight:600; padding:11px 18px; border-radius:var(--radius-md);">
                💵 Recibo de Caja
              </button>
              <button class="btn" id="btn-quick-producto" style="background:rgba(255,255,255,0.12); color:#ffffff; backdrop-filter:blur(10px); border:1px solid rgba(255,255,255,0.2); font-weight:600; padding:11px 18px; border-radius:var(--radius-md);">
                📦 Nuevo Artículo
              </button>
            </div>
          </div>
        </div>

        <!-- 4 TARJETAS KPI (Apple Bento Grid) -->
        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(240px, 1fr)); gap:18px;">
          
          <div class="panel" style="padding:22px; border-radius:var(--radius-lg); margin-bottom:0;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <span style="color:var(--muted); font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:.03em;">Ventas del Mes</span>
              <span style="display:grid; place-items:center; width:36px; height:36px; border-radius:var(--radius-md); background:var(--apple-blue-soft); font-size:18px;">💳</span>
            </div>
            <div style="font-size:26px; font-weight:800; font-family:var(--mono); color:var(--ink); margin:10px 0 4px; letter-spacing:-0.03em;">
              ${fmtMoneda(k.totalVentas || 0)}
            </div>
            <div style="font-size:12.5px; color:var(--muted);">
              <strong>${k.cantFacturas || 0}</strong> facturas emitidas
            </div>
          </div>

          <div class="panel" style="padding:22px; border-radius:var(--radius-lg); margin-bottom:0;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <span style="color:var(--muted); font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:.03em;">Cuentas por Cobrar</span>
              <span style="display:grid; place-items:center; width:36px; height:36px; border-radius:var(--radius-md); background:var(--apple-orange-soft); font-size:18px;">📋</span>
            </div>
            <div style="font-size:26px; font-weight:800; font-family:var(--mono); color:var(--ink); margin:10px 0 4px; letter-spacing:-0.03em;">
              ${fmtMoneda(k.totalCxC || 0)}
            </div>
            <div style="font-size:12.5px; color:${(k.cxcVencida || 0) > 0 ? 'var(--apple-red)' : 'var(--apple-green)'}; font-weight:600;">
              ${fmtMoneda(k.cxcVencida || 0)} vencidas
            </div>
          </div>

          <div class="panel" style="padding:22px; border-radius:var(--radius-lg); margin-bottom:0;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <span style="color:var(--muted); font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:.03em;">Valor Inventario</span>
              <span style="display:grid; place-items:center; width:36px; height:36px; border-radius:var(--radius-md); background:var(--apple-purple-soft); font-size:18px;">📦</span>
            </div>
            <div style="font-size:26px; font-weight:800; font-family:var(--mono); color:var(--ink); margin:10px 0 4px; letter-spacing:-0.03em;">
              ${fmtMoneda(k.valorInventario || 0)}
            </div>
            <div style="font-size:12.5px; color:var(--muted);">
              <strong>${k.totalProductos || 0}</strong> artículos en catálogo
            </div>
          </div>

          <div class="panel" style="padding:22px; border-radius:var(--radius-lg); margin-bottom:0;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <span style="color:var(--muted); font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:.03em;">Bancos & Caja</span>
              <span style="display:grid; place-items:center; width:36px; height:36px; border-radius:var(--radius-md); background:var(--apple-green-soft); font-size:18px;">🏦</span>
            </div>
            <div style="font-size:26px; font-weight:800; font-family:var(--mono); color:var(--apple-green); margin:10px 0 4px; letter-spacing:-0.03em;">
              ${fmtMoneda(k.totalBancos || 0)}
            </div>
            <div style="font-size:12.5px; color:var(--muted);">
              Liquidez disponible
            </div>
          </div>

        </div>

        <!-- DOS COLUMNAS: ÚLTIMAS VENTAS Y ALERTAS DE STOCK -->
        <div style="display:grid; grid-template-columns:1.4fr 1fr; gap:20px;">
          
          <div class="panel">
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
                      <td><strong style="color:var(--apple-blue);">${f.numero_factura}</strong></td>
                      <td>${f.cliente_nombre}</td>
                      <td style="color:var(--muted); font-size:12.5px;">${f.fecha}</td>
                      <td>
                        <span class="tag" style="background:${f.tipo_pago === 'CONTADO' ? 'var(--apple-green-soft)' : 'var(--apple-orange-soft)'}; color:${f.tipo_pago === 'CONTADO' ? 'var(--apple-green)' : 'var(--apple-orange)'};">
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

          <div class="panel">
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
                  ${(data.bajoStock || []).length === 0 ? '<tr><td colspan="3" class="vacio" style="color:var(--apple-green); font-weight:600;">✅ Todo el inventario sobre el mínimo.</td></tr>' : ''}
                  ${(data.bajoStock || []).map(p => `
                    <tr>
                      <td>
                        <strong>${p.descripcion}</strong>
                        <br><small style="color:var(--muted); font-family:var(--mono);">SKU: ${p.codigo}</small>
                      </td>
                      <td class="num font-bold" style="color:var(--apple-red); font-size:15px;">${p.stock_actual}</td>
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
