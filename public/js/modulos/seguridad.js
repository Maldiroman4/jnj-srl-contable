import { registrarModulo } from '../registro.js';
import { el, paginaHeader, statCard, fmtMoneda } from '../ui.js';
import { GET } from '../api.js';

export async function render() {
  const contenido = document.getElementById('app-contenido');
  contenido.innerHTML = '';

  contenido.appendChild(paginaHeader('Centro de Control & Auditoría — Super Usuario',
    'Panel exclusivo de Maldiroman777 para gestión de seguridad, monitoreo de dispositivos e informe de datos cargados en la base de datos.',
    'MALDIROMAN777 · SUPER USUARIO & AUDITOR GLOBAL'));

  try {
    const [stats, auditoria, datosCargados] = await Promise.all([
      GET('/api/seguridad/stats'),
      GET('/api/seguridad/auditoria?limite=100'),
      GET('/api/seguridad/datos-cargados')
    ]);

    const r = datosCargados.resumen_general || {};
    const k = stats.kpis || {};

    // Selector de Pestañas Super Usuario
    const tabsContainer = el(`
      <div style="display:flex; gap:10px; margin-bottom:20px; border-bottom:2px solid var(--separator); padding-bottom:10px; flex-wrap:wrap;">
        <button class="btn btn-primary" id="tab-btn-informe-datos">📊 Informe de Datos Cargados en BD</button>
        <button class="btn btn-secondary" id="tab-btn-auditoria-sesiones">🛡️ Auditoría de Sesiones & Dispositivos (${auditoria.length})</button>
        <button class="btn btn-secondary" id="tab-btn-ultimas-cargas">🔍 Inspección de Últimas Cargas</button>
      </div>
    `);
    contenido.appendChild(tabsContainer);

    // Contenedores de Vistas
    const vistaDatos = el('<div id="sec-vista-datos"></div>');
    const vistaAuditoria = el('<div id="sec-vista-auditoria" class="hidden"></div>');
    const vistaUltimasCargas = el('<div id="sec-vista-ultimas" class="hidden"></div>');

    // =========================================================================
    // VISTA 1: INFORME DE DATOS CARGADOS POR CATEGORÍA EN LA BASE DE DATOS
    // =========================================================================
    const kpiGrid = el('<div class="stats-grid"></div>');
    kpiGrid.appendChild(statCard({
      etiqueta: '📦 Productos en Inventario',
      valor: `${r.totalProductos || 0} artículos`,
      icono: '📦',
      tono: 'tone-blue'
    }));
    kpiGrid.appendChild(statCard({
      etiqueta: '🧾 Facturas Registradas',
      valor: `${r.totalFacturas || 0} (${fmtMoneda(r.montoFacturado || 0)})`,
      icono: '🧾',
      tono: 'tone-blue'
    }));
    kpiGrid.appendChild(statCard({
      etiqueta: '📝 Asientos Contables',
      valor: `${r.totalAsientos || 0} (${r.totalMovimientosContables || 0} partidas)`,
      icono: '📝',
      tono: 'tone-violet'
    }));
    kpiGrid.appendChild(statCard({
      etiqueta: '👥 Clientes & Proveedores',
      valor: `${r.totalClientes || 0} cli / ${r.totalProveedores || 0} prv`,
      icono: '👥',
      tono: 'tone-blue'
    }));
    vistaDatos.appendChild(kpiGrid);

    // Métricas Secundarias de la BD
    const subGrid = el(`
      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(280px, 1fr)); gap:18px; margin-bottom:22px;">
        <div class="panel" style="margin-bottom:0;">
          <h2>Base de Datos & Salud de Almacenamiento</h2>
          <div style="display:flex; flex-direction:column; gap:12px;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <span style="color:var(--muted); font-size:13px;">Motor de Base de Datos:</span>
              <strong style="font-family:var(--mono); color:var(--primary);">SQLite WAL Mode (Alto Rendimiento)</strong>
            </div>
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <span style="color:var(--muted); font-size:13px;">Tamaño de la Base de Datos:</span>
              <strong style="font-family:var(--mono); font-size:15px; color:var(--ink);">${r.dbSizeKB || 0} KB</strong>
            </div>
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <span style="color:var(--muted); font-size:13px;">Cuentas Bancarias / Tesorería:</span>
              <strong style="font-family:var(--mono); color:var(--ok);">${r.totalBancos || 0} cuentas (${fmtMoneda(r.saldoBancos || 0)})</strong>
            </div>
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <span style="color:var(--muted); font-size:13px;">Movimientos Kárdex Registrados:</span>
              <strong style="font-family:var(--mono);">${r.totalKardex || 0} movimientos</strong>
            </div>
          </div>
        </div>

        <div class="panel" style="margin-bottom:0;">
          <h2>Catálogo Contable por Naturaleza</h2>
          <div class="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Naturaleza de Cuenta</th>
                  <th class="num">Cuentas Cargadas</th>
                </tr>
              </thead>
              <tbody>
                ${(datosCargados.cuentasPorTipo || []).map(ct => `
                  <tr>
                    <td><strong>${ct.tipo_cuenta}</strong></td>
                    <td class="num font-mono">
                      <span class="tag" style="background:var(--blue-50); color:var(--primary); font-weight:800; padding:2px 8px;">
                        ${ct.cantidad}
                      </span>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `);
    vistaDatos.appendChild(subGrid);

    // Desglose de Inventario por Categorías de Productos
    const panelCategoriasProd = el(`
      <div class="panel">
        <h2>Inventario Cargado por Categorías de Productos</h2>
        <div class="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Categoría de Producto</th>
                <th class="num">Total Artículos</th>
                <th class="num">Unidades en Stock</th>
                <th class="num">Valor Costo Total</th>
                <th class="num">Valor Venta Estimado</th>
              </tr>
            </thead>
            <tbody>
              ${(datosCargados.productosPorCategoria || []).map(cp => `
                <tr>
                  <td><strong style="color:var(--primary);">${cp.categoria}</strong></td>
                  <td class="num font-mono font-bold">${cp.total_items} items</td>
                  <td class="num font-mono">${cp.stock_total || 0}</td>
                  <td class="num font-mono font-bold" style="color:var(--muted);">${fmtMoneda(cp.valor_costo_total || 0)}</td>
                  <td class="num font-mono font-bold" style="color:var(--primary);">${fmtMoneda(cp.valor_venta_total || 0)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `);
    vistaDatos.appendChild(panelCategoriasProd);

    // =========================================================================
    // VISTA 2: AUDITORÍA DE SESIONES & DISPOSITIVOS
    // =========================================================================
    const gridAuditKpis = el('<div class="stats-grid"></div>');
    gridAuditKpis.appendChild(statCard({
      etiqueta: 'Total Inicios de Sesión',
      valor: k.total || 0,
      icono: '🔐',
      tono: 'tone-blue'
    }));
    gridAuditKpis.appendChild(statCard({
      etiqueta: 'Dispositivos Únicos',
      valor: k.dispositivosUnicos || 0,
      icono: '📱',
      tono: 'tone-violet'
    }));
    gridAuditKpis.appendChild(statCard({
      etiqueta: 'IPs Registradas',
      valor: k.ipsUnicas || 0,
      icono: '🌐',
      tono: 'tone-blue'
    }));
    gridAuditKpis.appendChild(statCard({
      etiqueta: 'Accesos Exitosos vs Fallidos',
      valor: `${k.exitosos || 0} / ${k.fallidos || 0}`,
      icono: '🛡️',
      tono: 'tone-blue'
    }));
    vistaAuditoria.appendChild(gridAuditKpis);

    // Panel de Dispositivos y Frecuencia
    const panelDispositivos = el(`
      <div class="panel">
        <h2>Dispositivos Frecuentes & Conteo de Inicios de Sesión</h2>
        <div class="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Dispositivo Detectado</th>
                <th class="num">Veces que Inició Sesión</th>
                <th>Última Conexión</th>
              </tr>
            </thead>
            <tbody>
              ${(stats.porDispositivo || []).map(d => `
                <tr>
                  <td><strong>${d.dispositivo}</strong></td>
                  <td class="num font-mono">
                    <span class="tag" style="background:var(--blue-100); color:var(--primary); font-weight:800; font-size:12px; padding:3px 12px;">
                      ${d.cantidad} ${d.cantidad === 1 ? 'inicio' : 'inicios'}
                    </span>
                  </td>
                  <td style="color:var(--muted); font-size:12px; font-family:var(--mono);">${d.ultimo_acceso || '—'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `);
    vistaAuditoria.appendChild(panelDispositivos);

    // Tabla Completa de Auditoría en Vivo
    const panelAuditTable = el(`
      <div class="panel">
        <h2>Registro de Auditoría de Sesiones en Tiempo Real</h2>
        <div class="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Fecha y Hora</th>
                <th>Usuario</th>
                <th>Dispositivo & SO</th>
                <th>Navegador</th>
                <th>Dirección IP</th>
                <th>Ubicación Detectada</th>
                <th class="num">Conteo Dispositivo</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              ${auditoria.map(a => {
                const esExitoso = a.estado === 'EXITOSO';
                return `
                  <tr>
                    <td style="font-family:var(--mono); font-size:12px; color:var(--muted); white-space:nowrap;">${a.fecha_hora}</td>
                    <td><strong style="color:var(--primary); font-family:var(--mono);">${a.username}</strong></td>
                    <td>
                      <strong>${a.dispositivo}</strong>
                      <br><small style="color:var(--muted); font-size:11px;">${a.sistema_operativo}</small>
                    </td>
                    <td style="color:var(--ink-secondary); font-size:12.5px;">${a.navegador || '—'}</td>
                    <td style="font-family:var(--mono); font-weight:700; color:var(--ink); font-size:12.5px;">${a.ip}</td>
                    <td>
                      <span style="display:inline-flex; align-items:center; gap:4px; font-weight:600; font-size:12.5px;">
                        📍 ${a.ciudad ? `${a.ciudad}, ${a.pais}` : a.pais || 'Red Local'}
                      </span>
                    </td>
                    <td class="num font-mono">
                      <span class="tag" style="background:var(--blue-50); border:1px solid var(--blue-200); color:var(--primary); font-weight:800; padding:2px 8px;">
                        #${a.veces_iniciado || 1}
                      </span>
                    </td>
                    <td>
                      <span class="tag" style="background:${esExitoso ? 'var(--ok-soft)' : 'var(--danger-soft)'}; color:${esExitoso ? '#065f46' : 'var(--danger)'};">
                        ${esExitoso ? '✅ EXITOSO' : '❌ FALLIDO'}
                      </span>
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `);
    vistaAuditoria.appendChild(panelAuditTable);

    // =========================================================================
    // VISTA 3: INSPECCIÓN DE ÚLTIMAS CARGAS EN LA BASE DE DATOS
    // =========================================================================
    const u = datosCargados.ultimos_cargados || {};
    const panelUltimas = el(`
      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(320px, 1fr)); gap:20px;">
        
        <!-- Últimas Facturas -->
        <div class="panel" style="margin-bottom:0;">
          <h2>Últimas Facturas Cargadas</h2>
          <div class="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Factura</th>
                  <th>Cliente</th>
                  <th>Fecha</th>
                  <th class="num">Monto</th>
                </tr>
              </thead>
              <tbody>
                ${(u.facturas || []).map(f => `
                  <tr>
                    <td><strong style="color:var(--primary); font-family:var(--mono);">${f.numero_factura}</strong></td>
                    <td>${f.cliente_nombre}</td>
                    <td style="color:var(--muted); font-size:12px;">${f.fecha}</td>
                    <td class="num font-mono font-bold">${fmtMoneda(f.total)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>

        <!-- Últimos Asientos Contables -->
        <div class="panel" style="margin-bottom:0;">
          <h2>Últimos Asientos Contables Cargados</h2>
          <div class="table-scroll">
            <table>
              <thead>
                <tr>
                  <th># Asiento</th>
                  <th>Fecha</th>
                  <th>Concepto</th>
                  <th class="num">Total</th>
                </tr>
              </thead>
              <tbody>
                ${(u.asientos || []).map(a => `
                  <tr>
                    <td><strong style="color:var(--primary); font-family:var(--mono);">${a.numero}</strong></td>
                    <td style="color:var(--muted); font-size:12px;">${a.fecha}</td>
                    <td style="font-size:12.5px;">${a.concepto}</td>
                    <td class="num font-mono font-bold">${fmtMoneda(a.total_debe || 0)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>

        <!-- Últimos Productos de Inventario -->
        <div class="panel" style="margin-bottom:0;">
          <h2>Últimos Productos Registrados</h2>
          <div class="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Descripción</th>
                  <th>Categoría</th>
                  <th class="num">Stock</th>
                </tr>
              </thead>
              <tbody>
                ${(u.productos || []).map(p => `
                  <tr>
                    <td><strong style="font-family:var(--mono);">${p.codigo}</strong></td>
                    <td>${p.descripcion}</td>
                    <td><span class="tag" style="background:var(--blue-50); color:var(--primary);">${p.categoria}</span></td>
                    <td class="num font-mono font-bold">${p.stock_actual}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>

        <!-- Últimos Clientes -->
        <div class="panel" style="margin-bottom:0;">
          <h2>Últimos Clientes Registrados</h2>
          <div class="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Nombre</th>
                  <th>Cédula / RNC</th>
                </tr>
              </thead>
              <tbody>
                ${(u.clientes || []).map(c => `
                  <tr>
                    <td><strong style="font-family:var(--mono);">${c.codigo}</strong></td>
                    <td>${c.nombre}</td>
                    <td style="font-family:var(--mono); color:var(--muted); font-size:12px;">${c.cedula_rnc || '—'}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    `);
    vistaUltimasCargas.appendChild(panelUltimas);

    // Agregar Vistas al Contenido Principal
    contenido.appendChild(vistaDatos);
    contenido.appendChild(vistaAuditoria);
    contenido.appendChild(vistaUltimasCargas);

    // Manejar Pestañas
    const btnTabDatos = tabsContainer.querySelector('#tab-btn-informe-datos');
    const btnTabAudit = tabsContainer.querySelector('#tab-btn-auditoria-sesiones');
    const btnTabUltimas = tabsContainer.querySelector('#tab-btn-ultimas-cargas');

    const activarTab = (tabActivo) => {
      [btnTabDatos, btnTabAudit, btnTabUltimas].forEach(b => {
        b.className = 'btn btn-secondary';
      });
      vistaDatos.classList.add('hidden');
      vistaAuditoria.classList.add('hidden');
      vistaUltimasCargas.classList.add('hidden');

      if (tabActivo === 'datos') {
        btnTabDatos.className = 'btn btn-primary';
        vistaDatos.classList.remove('hidden');
      } else if (tabActivo === 'auditoria') {
        btnTabAudit.className = 'btn btn-primary';
        vistaAuditoria.classList.remove('hidden');
      } else if (tabActivo === 'ultimas') {
        btnTabUltimas.className = 'btn btn-primary';
        vistaUltimasCargas.classList.remove('hidden');
      }
    };

    btnTabDatos.addEventListener('click', () => activarTab('datos'));
    btnTabAudit.addEventListener('click', () => activarTab('auditoria'));
    btnTabUltimas.addEventListener('click', () => activarTab('ultimas'));

  } catch (err) {
    contenido.innerHTML = `<div class="msg msg-error">Error al cargar el Centro de Control de Super Usuario: ${err.message}</div>`;
  }
}

registrarModulo('seguridad', { render });
