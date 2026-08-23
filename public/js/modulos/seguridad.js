import { registrarModulo } from '../registro.js';
import { el, paginaHeader, statCard, fmtMoneda } from '../ui.js';
import { GET, POST } from '../api.js';

export async function render() {
  const contenido = document.getElementById('app-contenido');
  contenido.innerHTML = '';

  contenido.appendChild(paginaHeader('Seguridad & Auditoría de Sesiones',
    'Panel exclusivo de Super Usuario — Monitoreo de dispositivos, IPs, ubicaciones e inicios de sesión en tiempo real.',
    'MÓDULO SUPER ADMIN · SEGURIDAD'));

  try {
    const [stats, auditoria, usuarios] = await Promise.all([
      GET('/api/seguridad/stats'),
      GET('/api/seguridad/auditoria?limite=100'),
      GET('/api/seguridad/usuarios')
    ]);

    const k = stats.kpis || {};

    // Bento Grid de KPIs de Seguridad
    const statsGrid = el('<div class="stats-grid"></div>');
    statsGrid.appendChild(statCard({
      etiqueta: 'Total Inicios de Sesión',
      valor: k.total || 0,
      icono: '🔐',
      tono: 'tone-blue'
    }));
    statsGrid.appendChild(statCard({
      etiqueta: 'Dispositivos Únicos',
      valor: k.dispositivosUnicos || 0,
      icono: '📱',
      tono: 'tone-violet'
    }));
    statsGrid.appendChild(statCard({
      etiqueta: 'IPs / Ubicaciones',
      valor: k.ipsUnicas || 0,
      icono: '🌐',
      tono: 'tone-blue'
    }));
    statsGrid.appendChild(statCard({
      etiqueta: 'Accesos Exitosos',
      valor: k.exitosos || 0,
      icono: '🛡️',
      tono: 'tone-blue'
    }));
    contenido.appendChild(statsGrid);

    // Grid de 2 paneles: Resumen por Dispositivo y Gestión de Usuarios
    const topGrid = el(`
      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(320px, 1fr)); gap:20px; margin-bottom:22px;">
        
        <!-- Panel Dispositivos Frecuentes -->
        <div class="panel" style="margin-bottom:0;">
          <h2>Dispositivos Frecuentes & Conteo de Accesos</h2>
          <div class="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Dispositivo</th>
                  <th class="num">Inicios de Sesión</th>
                  <th>Último Acceso</th>
                </tr>
              </thead>
              <tbody>
                ${(stats.porDispositivo || []).map(d => `
                  <tr>
                    <td><strong>${d.dispositivo}</strong></td>
                    <td class="num font-mono">
                      <span class="tag" style="background:var(--blue-100); color:var(--primary); font-weight:800; font-size:12px; padding:3px 10px;">
                        ${d.cantidad} ${d.cantidad === 1 ? 'vez' : 'veces'}
                      </span>
                    </td>
                    <td style="color:var(--muted); font-size:12px; font-family:var(--mono);">${d.ultimo_acceso || '—'}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>

        <!-- Panel Usuarios del Sistema -->
        <div class="panel" style="margin-bottom:0;">
          <h2>Usuarios y Roles del Sistema</h2>
          <div class="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Usuario</th>
                  <th>Nombre Completo</th>
                  <th>Rol</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                ${usuarios.map(u => `
                  <tr>
                    <td><strong style="color:var(--primary); font-family:var(--mono);">${u.username}</strong></td>
                    <td>${u.nombre_completo}</td>
                    <td>
                      <span class="tag" style="background:${u.rol === 'SUPER_ADMIN' ? 'linear-gradient(135deg, #0284c7, #2563eb)' : 'var(--blue-50)'}; color:${u.rol === 'SUPER_ADMIN' ? '#fff' : 'var(--primary)'}; font-weight:700;">
                        ${u.rol === 'SUPER_ADMIN' ? '👑 SUPER USER' : u.rol}
                      </span>
                    </td>
                    <td><span class="tag" style="background:var(--ok-soft); color:#065f46;">Activo</span></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    `);
    contenido.appendChild(topGrid);

    // Tabla Principal de Auditoría de Sesiones
    const panelAuditoria = el(`
      <div class="panel">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; margin-bottom:14px;">
          <h2 style="margin-bottom:0; border-bottom:none; padding-bottom:0;">Registro de Auditoría de Sesiones en Vivo</h2>
          <span style="font-size:12px; color:var(--muted); font-family:var(--mono);">Monitoreo de IP, Ubicación y Conteo de Dispositivos</span>
        </div>
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
              ${auditoria.length === 0 ? '<tr><td colspan="8" class="vacio">No hay registros de auditoría aún.</td></tr>' : ''}
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
    contenido.appendChild(panelAuditoria);

  } catch (err) {
    contenido.innerHTML = `<div class="msg msg-error">Error al cargar la auditoría de seguridad: ${err.message}</div>`;
  }
}

registrarModulo('seguridad', { render });
