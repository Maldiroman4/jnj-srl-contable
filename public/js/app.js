import { cargarClases, fmtCodigo } from './ui.js';
import { modulos } from './registro.js';

// Módulos del Sistema Integral JNJ SRL
import './modulos/dashboard.js';
import './modulos/facturacion.js';
import './modulos/inventario.js';
import './modulos/clientes.js';
import './modulos/cxc.js';
import './modulos/bancos.js';
import './modulos/companias.js';
import './modulos/catalogo.js';
import './modulos/asientos.js';
import './modulos/procesos.js';
import './modulos/reportes.js';
import './modulos/seguridad.js';
import './modulos/extras.js';

const estado = {
  compania: null,
  companias: [],
  ano: null,
  mes: null,
};

export function getEstado() { return estado; }

export function setCompania(c) {
  if (!c) {
    estado.compania = null;
    estado.ano = null;
    estado.mes = null;
    sessionStorage.removeItem('jnj_compania_activa');
    localStorage.removeItem('compania');
    actualizarBarra();
    return;
  }
  estado.compania = c.id_compania;
  estado.ano = c.ano_activo || 2026;
  estado.mes = c.mes_activo || 8;
  sessionStorage.setItem('jnj_compania_activa', c.id_compania);
  localStorage.setItem('compania', c.id_compania);
  localStorage.setItem('ano', estado.ano);
  localStorage.setItem('mes', estado.mes);
  actualizarBarra();
}

export function actualizarBarra() {
  const nombreEl = document.getElementById('tenant-nombre-header');
  const mesEl = document.getElementById('hdr-mes-val');
  const anoEl = document.getElementById('hdr-ano-val');
  const periodoLabel = document.getElementById('periodo-label');
  const sel = document.getElementById('sel-compania');

  if (estado.compania) {
    const comp = estado.companias.find(x => x.id_compania === estado.compania);
    const razon = comp ? comp.razon_social : `Empresa #${estado.compania}`;
    if (nombreEl) nombreEl.textContent = `${estado.compania} - ${razon}`;
    if (mesEl) mesEl.textContent = String(estado.mes || '08').padStart(2, '0');
    if (anoEl) anoEl.textContent = estado.ano || '2026';
    if (sel) sel.value = estado.compania;
    if (periodoLabel) {
      periodoLabel.style.display = 'inline-flex';
    }
  } else {
    if (nombreEl) nombreEl.textContent = 'Seleccionar Empresa';
    if (mesEl) mesEl.textContent = '--';
    if (anoEl) anoEl.textContent = '----';
  }
}

export async function inicializar() {
  inicializarInterfaz();
  configurarSidebarMovil();
  configurarEventosSeleccionEmpresa();

  document.getElementById('modal-cerrar').addEventListener('click', () => {
    document.getElementById('modal').classList.add('hidden');
  });
  document.getElementById('modal').addEventListener('click', (e) => {
    if (e.target.id === 'modal') document.getElementById('modal').classList.add('hidden');
  });

  // Botón Cambiador de Empresa en el Header
  document.getElementById('btn-tenant-switcher')?.addEventListener('click', () => {
    abrirModalSeleccionEmpresa();
  });

  document.getElementById('sel-compania').addEventListener('change', async (e) => {
    const c = estado.companias.find(x => x.id_compania === Number(e.target.value));
    if (c) {
      setCompania(c);
      await refrescar();
    }
  });

  document.querySelectorAll('#app-menu button').forEach(b => {
    b.addEventListener('click', () => mostrar(b.dataset.modulo));
  });

  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;
    const n = ['1', '2', '3', '4', '5', '6', '7', '8', '9'].indexOf(e.key);
    if (n >= 0) {
      const botones = document.querySelectorAll('#app-menu button');
      if (botones[n]) mostrar(botones[n].dataset.modulo);
    }
  });

  try {
    const comps = await (await fetch('/api/companias')).json();
    estado.companias = comps;
    const sel = document.getElementById('sel-compania');
    if (sel) {
      sel.innerHTML = '';
      for (const c of comps) {
        const op = document.createElement('option');
        op.value = c.id_compania;
        op.textContent = `${c.id_compania} - ${c.razon_social}`;
        sel.appendChild(op);
      }
    }

    // Obtener rol del usuario autenticado
    const userDataRaw = sessionStorage.getItem('jnj_user_data');
    let rolUsuario = 'CONTADOR';
    if (userDataRaw) {
      try { rolUsuario = JSON.parse(userDataRaw).rol || 'CONTADOR'; } catch (e) {}
    }
    aplicarPermisosRol(rolUsuario);

    if (rolUsuario === 'SUPER_ADMIN') {
      await mostrar('seguridad');
    } else {
      // REQUISITO: Desactivar empresa por defecto y forzar selección
      estado.compania = null;
      actualizarBarra();
      abrirModalSeleccionEmpresa();
    }
  } catch (e) {
    const contenido = document.getElementById('app-contenido');
    contenido.innerHTML = `<div class="msg msg-error">No se pudo conectar con el servidor: ${e.message}</div>`;
  }
}

// ---------------------------------------------------------------------------
// COMPONENTE: SELECCIÓN FORZOSA DE EMPRESA Y CAPTURA DE CÓDIGO
// ---------------------------------------------------------------------------
export async function abrirModalSeleccionEmpresa() {
  const modal = document.getElementById('modal-seleccion-empresa');
  const inputCod = document.getElementById('input-codigo-empresa-modal');
  const boxNoExiste = document.getElementById('box-empresa-no-existe');
  const formNueva = document.getElementById('form-incluir-empresa-rapida');
  const grid = document.getElementById('grid-empresas-modal');
  const lblTotal = document.getElementById('lbl-total-empresas-modal');

  if (!modal) return;

  boxNoExiste?.classList.add('hidden');
  formNueva?.classList.add('hidden');
  if (inputCod) {
    inputCod.value = '';
  }

  try {
    const comps = await (await fetch('/api/companias')).json();
    estado.companias = comps;
    if (lblTotal) lblTotal.textContent = `${comps.length} registradas`;

    if (grid) {
      grid.innerHTML = '';
      comps.forEach(c => {
        const esActiva = (estado.compania === c.id_compania);
        const card = document.createElement('div');
        card.className = 'empresa-card-modal';
        card.style.cssText = `
          background: ${esActiva ? 'rgba(56,189,248,0.18)' : '#071322'};
          border: 1.5px solid ${esActiva ? '#38bdf8' : '#1e3a5f'};
          border-radius: 10px;
          padding: 12px 14px;
          cursor: pointer;
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 10px;
          transition: all .15s ease;
        `;
        card.innerHTML = `
          <div>
            <div style="font-weight:700; color:#fff; font-size:13.5px;">
              <span style="color:#38bdf8; font-family:'JetBrains Mono',monospace; font-weight:800;">${c.id_compania}</span> - ${c.razon_social}
            </div>
            <div style="font-size:11.5px; color:#94a3b8; margin-top:2px;">
              Cédula: ${c.cedula_juridica || '3-101-000000'} &middot; Período: ${String(c.mes_activo).padStart(2,'0')}/${c.ano_activo}
            </div>
          </div>
          <button class="btn btn-sm ${esActiva ? 'btn-primary' : 'btn-secondary'}" style="font-size:11.5px; padding:4px 10px; flex-shrink:0;">
            ${esActiva ? '✓ Activa' : 'Abrir Empresa'}
          </button>
        `;

        card.addEventListener('click', () => {
          seleccionarYActivarEmpresa(c);
        });
        grid.appendChild(card);
      });
    }
  } catch (err) {
    console.error('Error cargando empresas:', err);
  }

  modal.classList.remove('hidden');
  setTimeout(() => {
    inputCod?.focus();
    inputCod?.select();
  }, 100);
}

export async function seleccionarYActivarEmpresa(comp) {
  setCompania(comp);
  const modal = document.getElementById('modal-seleccion-empresa');
  if (modal) modal.classList.add('hidden');

  mostrarNotificacionGlobal(`🏢 Empresa activa: [${comp.id_compania} - ${comp.razon_social}] sincronizada.`);
  await mostrar('catalogo');
  await refrescar();
}

function configurarEventosSeleccionEmpresa() {
  const inputCod = document.getElementById('input-codigo-empresa-modal');
  const btnBuscar = document.getElementById('btn-buscar-codigo-empresa');
  const btnConfirmar = document.getElementById('btn-confirmar-incluir-empresa');
  const btnCancelarNo = document.getElementById('btn-cancelar-incluir-empresa');
  const formNueva = document.getElementById('form-incluir-empresa-rapida');
  const boxNoExiste = document.getElementById('box-empresa-no-existe');
  const btnGuardarAprov = document.getElementById('btn-guardar-aprovisionar-empresa');
  const btnCerrarAprov = document.getElementById('btn-cerrar-aprovisionar-empresa');

  const ejecutarBusquedaCodigo = () => {
    const val = (inputCod?.value || '').trim();
    if (!val) return;

    const num = parseInt(val, 10);
    if (isNaN(num)) return;

    const encontrada = estado.companias.find(x => x.id_compania === num);
    if (encontrada) {
      boxNoExiste?.classList.add('hidden');
      formNueva?.classList.add('hidden');
      seleccionarYActivarEmpresa(encontrada);
    } else {
      // Manejo de Empresa Inexistente con confirmación
      formNueva?.classList.add('hidden');
      const lblNoExiste = document.getElementById('lbl-empresa-no-existe-txt');
      const lblNuevaNum = document.getElementById('lbl-nueva-empresa-num');
      if (lblNoExiste) lblNoExiste.textContent = `⚠️ La empresa No. [${num}] no existe en el sistema.`;
      if (lblNuevaNum) lblNuevaNum.textContent = num;
      boxNoExiste?.classList.remove('hidden');
      btnConfirmar?.focus();
    }
  };

  btnBuscar?.addEventListener('click', ejecutarBusquedaCodigo);
  inputCod?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      ejecutarBusquedaCodigo();
    }
  });

  btnConfirmar?.addEventListener('click', () => {
    boxNoExiste?.classList.add('hidden');
    formNueva?.classList.remove('hidden');
    const inputNombre = document.getElementById('input-nueva-empresa-nombre');
    const inputCedula = document.getElementById('input-nueva-empresa-cedula');
    if (inputNombre) inputNombre.value = '';
    if (inputCedula) inputCedula.value = '';
    inputNombre?.focus();
  });

  btnCancelarNo?.addEventListener('click', () => {
    boxNoExiste?.classList.add('hidden');
    if (inputCod) {
      inputCod.value = '';
      inputCod.focus();
    }
  });

  btnCerrarAprov?.addEventListener('click', () => {
    formNueva?.classList.add('hidden');
    if (inputCod) {
      inputCod.value = '';
      inputCod.focus();
    }
  });

  btnGuardarAprov?.addEventListener('click', async () => {
    const num = parseInt(document.getElementById('lbl-nueva-empresa-num').textContent, 10);
    const razon_social = (document.getElementById('input-nueva-empresa-nombre').value || '').trim();
    const cedula_juridica = (document.getElementById('input-nueva-empresa-cedula').value || '').trim();
    const optCat = document.getElementById('sel-nuevo-catalogo-modo').value;

    if (!razon_social) {
      alert('Por favor digite la razón social de la empresa.');
      return;
    }

    try {
      btnGuardarAprov.disabled = true;
      btnGuardarAprov.textContent = 'Aprovisionando...';

      const res = await fetch('/api/companias', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id_compania: num,
          razon_social,
          cedula_juridica: cedula_juridica || '3-101-000000',
          ano_activo: 2026,
          mes_activo: 8
        })
      });

      const nuevaComp = await res.json();
      if (!res.ok) throw new Error(nuevaComp.error || 'Error creando la empresa');

      // Si es sin catálogo, asegurar cuenta 999-000000
      if (optCat === '1') {
        try {
          await fetch('/api/cuentas', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id_compania: num,
              id_cuenta: 999000000,
              descripcion: '*** UTILIDADES O PERDIDAS DEL PERIODO ***',
              tipo: '3',
              nivel1: '999',
              nivel2: '00',
              nivel3: '000'
            })
          });
        } catch (e) {}
      }

      // Recargar lista y activar
      const compsActualizadas = await (await fetch('/api/companias')).json();
      estado.companias = compsActualizadas;
      const compCreada = compsActualizadas.find(x => x.id_compania === num) || nuevaComp;
      
      formNueva?.classList.add('hidden');
      seleccionarYActivarEmpresa(compCreada);
    } catch (err) {
      alert('Error: ' + err.message);
    } finally {
      btnGuardarAprov.disabled = false;
      btnGuardarAprov.textContent = '💾 Crear y Abrir Empresa';
    }
  });
}

export async function refrescar() {
  const mod = document.querySelector('#app-menu button.activo');
  if (mod && modulos[mod.dataset.modulo]) {
    await modulos[mod.dataset.modulo].render();
  }
}

export async function sincronizarTodoElSistema(idCompaniaDeseada = null) {
  try {
    const comps = await (await fetch('/api/companias')).json();
    estado.companias = comps;

    const sel = document.getElementById('sel-compania');
    if (sel) {
      sel.innerHTML = '';
      for (const c of comps) {
        const op = document.createElement('option');
        op.value = c.id_compania;
        op.textContent = `${c.id_compania} - ${c.razon_social}`;
        sel.appendChild(op);
      }
    }

    const idTarget = idCompaniaDeseada || estado.compania || comps[0]?.id_compania;
    const cSel = comps.find(x => x.id_compania === Number(idTarget)) || comps[0];

    if (cSel) {
      if (sel) sel.value = cSel.id_compania;
      setCompania(cSel);
    }

    // Refrescar módulo actual
    await refrescar();

    mostrarNotificacionGlobal(`✅ Empresa activa: [${cSel.id_compania} - ${cSel.razon_social}] sincronizada en todos los módulos.`);
  } catch (err) {
    console.error('Error al sincronizar el sistema:', err);
    mostrarNotificacionGlobal(`❌ Error de sincronización: ${err.message}`, true);
  }
}

export function mostrarNotificacionGlobal(mensaje, esError = false) {
  let toast = document.getElementById('jnj-toast-global');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'jnj-toast-global';
    toast.style.position = 'fixed';
    toast.style.bottom = '24px';
    toast.style.right = '24px';
    toast.style.zIndex = '99999';
    toast.style.padding = '14px 22px';
    toast.style.borderRadius = '10px';
    toast.style.boxShadow = '0 10px 25px -5px rgba(0,0,0,0.3)';
    toast.style.fontWeight = '700';
    toast.style.fontSize = '14px';
    toast.style.display = 'flex';
    toast.style.alignItems = 'center';
    toast.style.gap = '10px';
    toast.style.transition = 'all 0.3s ease';
    document.body.appendChild(toast);
  }

  toast.style.background = esError ? '#ef4444' : '#0f766e';
  toast.style.color = '#ffffff';
  toast.textContent = mensaje;
  toast.style.opacity = '1';
  toast.style.transform = 'translateY(0)';

  clearTimeout(toast._timeout);
  toast._timeout = setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(20px)';
  }, 4000);
}

export async function mostrar(nombre) {
  const userDataRaw = sessionStorage.getItem('jnj_user_data');
  let rolUsuario = 'CONTADOR';
  if (userDataRaw) {
    try { rolUsuario = JSON.parse(userDataRaw).rol || 'CONTADOR'; } catch (e) {}
  }

  // Super Usuario (Maldiroman777) SOLO ve 'seguridad'
  if (rolUsuario === 'SUPER_ADMIN' && nombre !== 'seguridad') {
    nombre = 'seguridad';
  }

  // Contador (Joel777) NO ve 'seguridad'
  if (rolUsuario !== 'SUPER_ADMIN' && nombre === 'seguridad') {
    nombre = 'catalogo';
  }

  // Navigation Guard: si es contador y no hay empresa seleccionada, forzar selección
  if (rolUsuario !== 'SUPER_ADMIN' && !estado.compania) {
    abrirModalSeleccionEmpresa();
    return;
  }

  document.querySelectorAll('#app-menu button').forEach(b =>
    b.classList.toggle('activo', b.dataset.modulo === nombre));

  document.querySelectorAll('#mobile-tab-bar .tab-item[data-modulo]').forEach(b =>
    b.classList.toggle('activo', b.dataset.modulo === nombre));

  const contenido = document.getElementById('app-contenido');
  const def = modulos[nombre];
  if (!def) {
    contenido.innerHTML = '<div class="msg msg-error">Módulo no encontrado.</div>';
    return;
  }
  try {
    await def.render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (e) {
    contenido.innerHTML = `<div class="msg msg-error">${e.message}</div>`;
  }
}

function configurarSidebarMovil() {
  const sidebar = document.getElementById('sidebar');
  const backdrop = document.getElementById('sidebar-backdrop');
  const btnAbrir = document.getElementById('btn-toggle-sidebar');
  const btnCerrar = document.getElementById('btn-close-sidebar');
  const tabMas = document.getElementById('tab-btn-mas');

  const abrir = () => {
    sidebar?.classList.add('open');
    backdrop?.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  };

  const cerrar = () => {
    sidebar?.classList.remove('open');
    backdrop?.classList.add('hidden');
    document.body.style.overflow = '';
  };

  btnAbrir?.addEventListener('click', abrir);
  tabMas?.addEventListener('click', abrir);
  btnCerrar?.addEventListener('click', cerrar);
  backdrop?.addEventListener('click', cerrar);

  // Cerrar drawer al hacer clic en cualquier opción del sidebar en tablet/móvil
  document.querySelectorAll('#app-menu button').forEach(b => {
    b.addEventListener('click', () => {
      if (window.innerWidth <= 1024) cerrar();
    });
  });

  // Manejar clics de los tabs móviles inferiores
  document.querySelectorAll('#mobile-tab-bar .tab-item[data-modulo]').forEach(b => {
    b.addEventListener('click', () => {
      cerrar();
      mostrar(b.dataset.modulo);
    });
  });
}

// ---------------------------------------------------------------------------
// Interfaz: popovers, búsqueda global y atajos (solo presentación)
// ---------------------------------------------------------------------------
function inicializarInterfaz() {
  // --- Popovers: notificaciones y perfil ---
  const notifBtn = document.getElementById('btn-notificaciones');
  const perfilBtn = document.getElementById('btn-perfil');
  const panelNot = document.getElementById('panel-notificaciones');
  const panelPerf = document.getElementById('panel-perfil');

  const alternar = (btn, panel) => {
    const oculto = panel.classList.contains('hidden');
    [panelNot, panelPerf].forEach(p => { if (p !== panel) p.classList.add('hidden'); });
    [notifBtn, perfilBtn].forEach(b => { if (b && b !== btn) b.classList.remove('open'); });
    panel.classList.toggle('hidden', !oculto);
    if (btn) btn.classList.toggle('open', !oculto);
  };

  const cerrarPopovers = () => {
    [panelNot, panelPerf].forEach(p => p && p.classList.add('hidden'));
    [notifBtn, perfilBtn].forEach(b => b && b.classList.remove('open'));
  };

  notifBtn?.addEventListener('click', (e) => { e.stopPropagation(); alternar(notifBtn, panelNot); });
  perfilBtn?.addEventListener('click', (e) => { e.stopPropagation(); alternar(perfilBtn, panelPerf); });
  document.addEventListener('click', cerrarPopovers);

  panelPerf?.querySelectorAll('[data-ir]').forEach(b => b.addEventListener('click', () => {
    cerrarPopovers();
    const nav = document.querySelector(`#app-menu button[data-modulo="${b.dataset.ir}"]`);
    if (nav) nav.click();
  }));

  // --- Búsqueda global de cuentas ---
  const buscar = document.getElementById('global-search');
  const resultados = document.getElementById('search-results');
  let cuentasCache = [];
  let selIndex = -1;

  const cargarCache = async () => {
    try {
      const res = await fetch(`/api/cuentas?compania=${estado.compania}`);
      cuentasCache = await res.json();
    } catch { cuentasCache = []; }
  };

  const renderResultados = (q) => {
    const query = (q || '').trim().toLowerCase();
    if (!query) { resultados.classList.add('hidden'); return; }
    const num = query.replace(/\D/g, '');
    const filtradas = cuentasCache.filter(c =>
      (c.descripcion || '').toLowerCase().includes(query) ||
      (num && String(c.id_cuenta || '').includes(num)));
    if (filtradas.length === 0) {
      resultados.innerHTML = `<div class="search-empty">Sin resultados para "${q}"</div>`;
    } else {
      resultados.innerHTML = `<div class="search-group">Catálogo de cuentas</div>` + filtradas.slice(0, 12).map((c, i) => `
        <button class="search-item" data-idx="${i}">
          <span class="si-codigo">${fmtCodigo(c.id_cuenta)}</span>
          <span class="si-desc">${c.descripcion || ''}</span>
          <span class="si-tipo">${c.nivel2 === '00' && c.nivel3 === '000' ? 'Mayor' : c.nivel3 === '000' ? 'Sub' : 'Detalle'}</span>
        </button>`).join('');
    }
    resultados.classList.remove('hidden');
    selIndex = -1;
    marcarActivo();
  };

  const marcarActivo = () => {
    resultados.querySelectorAll('.search-item').forEach((b, i) => b.classList.toggle('active', i === selIndex));
  };

  const elegir = (i) => {
    const items = [...resultados.querySelectorAll('.search-item')];
    const item = items[i];
    if (!item) return;
    const codigo = item.querySelector('.si-codigo').textContent;
    resultados.classList.add('hidden');
    buscar.value = '';
    if (cuentasCache.some(x => fmtCodigo(x.id_cuenta) === codigo)) {
      const nav = document.querySelector('#app-menu button[data-modulo="catalogo"]');
      if (nav) nav.click();
    }
  };

  buscar?.addEventListener('input', async () => {
    if (!cuentasCache.length) await cargarCache();
    renderResultados(buscar.value);
  });
  buscar?.addEventListener('focus', () => { if (buscar.value) renderResultados(buscar.value); });
  buscar?.addEventListener('keydown', (e) => {
    const total = resultados.querySelectorAll('.search-item').length;
    if (e.key === 'ArrowDown') { e.preventDefault(); selIndex = Math.min(selIndex + 1, total - 1); marcarActivo(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); selIndex = Math.max(selIndex - 1, 0); marcarActivo(); }
    else if (e.key === 'Enter') { e.preventDefault(); elegir(selIndex); }
    else if (e.key === 'Escape') { resultados.classList.add('hidden'); buscar.blur(); }
  });
  resultados?.addEventListener('mousedown', (e) => {
    const item = e.target.closest('.search-item');
    if (item) elegir([...resultados.querySelectorAll('.search-item')].indexOf(item));
  });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.search-wrap')) resultados.classList.add('hidden');
  });

  // Al cambiar de compañía se refresca el caché de búsqueda.
  document.getElementById('sel-compania').addEventListener('change', () => { cuentasCache = []; });

  // Atajo '/' para enfocar la búsqueda global.
  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && !['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) {
      e.preventDefault();
      buscar?.focus();
      buscar?.select();
    }
  });
}

import './modulos/companias.js';
import './modulos/catalogo.js';
import './modulos/asientos.js';
import './modulos/procesos.js';
import './modulos/reportes.js';

// ---------------------------------------------------------------------------
// Inicio de sesión seguro: Usuario Joel777 / Contraseña 585858
// ---------------------------------------------------------------------------
const credenciales = { usuario: 'Joel777', password: '585858' };
const claveSesion = 'jnj_sesion_activa';
let appArrancada = false;

const sesionActiva = () => sessionStorage.getItem(claveSesion) === '1';

function configurarLogin() {
  const form = document.getElementById('login-form');
  const screen = document.getElementById('login-screen');

  // Mostrar / ocultar contraseña
  document.getElementById('login-eye')?.addEventListener('click', () => {
    const pass = document.getElementById('login-pass');
    const mostrar = pass.type === 'password';
    pass.type = mostrar ? 'text' : 'password';
    pass.focus();
  });

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const u = document.getElementById('login-user').value.trim();
    const p = document.getElementById('login-pass').value;
    const err = document.getElementById('login-error');
    const btn = document.getElementById('login-btn');

    btn.disabled = true;
    btn.textContent = 'Verificando...';

    try {
      let autenticado = false;
      let userData = null;

      // Validación con backend API
      try {
        const resp = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ usuario: u, password: p })
        });
        const resJson = await resp.json();
        if (resJson.ok) {
          autenticado = true;
          userData = resJson;
          sessionStorage.setItem('jnj_token', resJson.token || '1');
        }
      } catch (errApi) {
        // Fallback validación directa
        if (u === 'Maldiroman777' && p === '858585') {
          autenticado = true;
          userData = { usuario: 'Maldiroman777', rol: 'SUPER_ADMIN', nombre_completo: 'Maldiroman · Super Usuario' };
        } else if (u === 'Joel777' && p === '585858') {
          autenticado = true;
          userData = { usuario: 'Joel777', rol: 'CONTADOR', nombre_completo: 'Joel · Contador' };
        }
      }

      if (autenticado) {
        sessionStorage.setItem(claveSesion, '1');
        sessionStorage.setItem('jnj_usuario', u);
        if (userData) {
          sessionStorage.setItem('jnj_user_data', JSON.stringify(userData));
          actualizarPerfilUI(userData);
          aplicarPermisosRol(userData.rol || 'CONTADOR');
        }

        err?.classList.add('hidden');
        screen?.classList.add('hidden');

        if (userData?.sesion_info) {
          const info = userData.sesion_info;
          setTimeout(() => {
            mostrarNotificacionGlobal(`👋 Sesión iniciada: ${u} · Dispositivo: ${info.dispositivo} (Acceso #${info.total_inicios_dispositivo}) · IP: ${info.ip}`);
          }, 800);
        }

        if (!appArrancada) {
          appArrancada = true;
          inicializar();
        } else {
          const moduloTarget = (userData?.rol === 'SUPER_ADMIN') ? 'seguridad' : 'catalogo';
          mostrar(moduloTarget);
        }
      } else {
        err.textContent = 'Credenciales incorrectas. Verifique el usuario y la contraseña.';
        err?.classList.remove('hidden');
        document.getElementById('login-pass').value = '';
        document.getElementById('login-pass').focus();
      }
    } finally {
      btn.disabled = false;
      btn.textContent = 'Ingresar al sistema';
    }
  });

  // Cerrar sesión desde el menú de perfil.
  document.getElementById('btn-salir')?.addEventListener('click', () => {
    sessionStorage.clear();
    location.reload();
  });
}

function actualizarPerfilUI(userData) {
  if (!userData) return;
  const nombreEl = document.querySelector('.profile-name');
  const rolEl = document.querySelector('.profile-role');
  const avatarEl = document.querySelector('.profile .avatar');
  const popHead = document.querySelector('#panel-perfil .popover-head');

  const u = userData.usuario || 'Usuario';
  const rol = userData.rol === 'SUPER_ADMIN' ? '👑 Super Usuario' : (userData.rol || 'Contador');
  const initials = u.substring(0, 2).toUpperCase();

  if (nombreEl) nombreEl.textContent = u;
  if (rolEl) rolEl.textContent = rol;
  if (avatarEl) avatarEl.textContent = initials;
  if (popHead) popHead.textContent = `${u} · ${rol}`;
}

export function aplicarPermisosRol(rol) {
  const esSuperUser = (rol === 'SUPER_ADMIN');

  // Ajustar títulos del sidebar
  document.querySelectorAll('.sidebar-section-title').forEach(el => {
    el.style.display = esSuperUser ? 'none' : 'block';
  });

  // Ajustar botones del sidebar
  document.querySelectorAll('#app-menu button').forEach(b => {
    const mod = b.dataset.modulo;
    if (mod === 'seguridad') {
      b.style.display = esSuperUser ? 'flex' : 'none';
    } else {
      b.style.display = esSuperUser ? 'none' : 'flex';
    }
  });

  // Ajustar menú emergente del perfil
  document.querySelectorAll('#panel-perfil button[data-ir]').forEach(b => {
    const ir = b.dataset.ir;
    if (ir === 'seguridad') {
      b.style.display = esSuperUser ? 'flex' : 'none';
    } else {
      b.style.display = esSuperUser ? 'none' : 'flex';
    }
  });

  // Ajustar barra móvil inferior
  document.querySelectorAll('#mobile-tab-bar .tab-item').forEach(b => {
    const mod = b.dataset.modulo;
    if (mod === 'seguridad') {
      b.style.display = esSuperUser ? 'flex' : 'none';
    } else if (b.id === 'tab-btn-mas') {
      b.style.display = 'flex';
    } else if (mod) {
      b.style.display = esSuperUser ? 'none' : 'flex';
    }
  });

  // Topbar: Selector de compañía y búsqueda solo para Contador
  const companyCtrl = document.querySelector('.company-control');
  const searchWrap = document.querySelector('.search-wrap');
  if (companyCtrl) companyCtrl.style.display = esSuperUser ? 'none' : 'flex';
  if (searchWrap) searchWrap.style.display = esSuperUser ? 'none' : 'flex';
}

configurarLogin();

if (sesionActiva()) {
  document.getElementById('login-screen').classList.add('hidden');
  const storedUser = sessionStorage.getItem('jnj_user_data');
  if (storedUser) {
    try { actualizarPerfilUI(JSON.parse(storedUser)); } catch (e) {}
  }
  appArrancada = true;
  inicializar();
} else {
  document.getElementById('login-screen').classList.remove('hidden');
  document.getElementById('login-user').focus();
}
