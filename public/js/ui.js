export const fmtMonto = (n) => {
  const v = Number(n) || 0;
  return v.toLocaleString('es-CR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

export const fmtMoneda = (n) => `\u20A1${fmtMonto(n)}`;

export const fmtCodigo = (id) => String(id || '').replace(/(\d{3})(\d{2})(\d{3})/, '$1-$2-$3');

export const el = (html) => {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
};

// Devuelve todos los hijos raíz del HTML (para bloques de varios elementos).
export const elFragment = (html) => {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content;
};

export function mensaje(contenedor, texto, tipo = 'info') {
  const prev = contenedor.querySelector('.msg');
  if (prev) prev.remove();
  const m = el(`<div class="msg msg-${tipo}">${texto}</div>`);
  contenedor.prepend(m);
  return m;
}

export function abrirModal(titulo, cuerpoHtml) {
  document.getElementById('modal-titulo').textContent = titulo;
  document.getElementById('modal-cuerpo').innerHTML = cuerpoHtml;
  document.getElementById('modal').classList.remove('hidden');
}

export function cerrarModal() {
  document.getElementById('modal').classList.add('hidden');
}

export function cargarClases(select) {
  return fetch('/api/cuentas/clases').then(r => r.json()).then(clases => {
    select.innerHTML = '';
    for (const c of clases) {
      const op = document.createElement('option');
      op.value = c.id_clase;
      op.textContent = `${c.id_clase}. ${c.nombre} (${c.tipo_rubro})`;
      select.appendChild(op);
    }
    return clases;
  });
}

export function consultaCuentas(compania) {
  return fetch(`/api/cuentas?compania=${compania}`).then(r => r.json());
}

export function estado(e) {
  return {
    compania: Number(e.target.value),
    mes: Number(document.getElementById('sel-mes')?.value || new Date().getMonth() + 1),
    ano: Number(document.getElementById('sel-ano')?.value || new Date().getFullYear()),
  };
}

export function configurarMascaraCuenta(input) {
  input.addEventListener('input', () => {
    let v = input.value.replace(/\D/g, '').slice(0, 8);
    let salida = '';
    if (v.length > 3) salida = v.slice(0, 3) + '-';
    else return void (input.value = v);
    if (v.length > 5) salida += v.slice(3, 5) + '-';
    else salida += v.slice(3);
    if (v.length > 5) salida += v.slice(5);
    input.value = salida;
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Backspace') {
      const v = input.value;
      if (v.endsWith('-')) input.value = v.slice(0, -1);
    }
  });
}

export const nivelDe = (cuenta) => {
  if (cuenta.nivel2 === '00' && cuenta.nivel3 === '000') return 1;
  if (cuenta.nivel3 === '000') return 2;
  return 3;
};

// ---------------------------------------------------------------------------
// Helpers visuales (solo presentación, no alteran lógica)
// ---------------------------------------------------------------------------

export function paginaHeader(titulo, subtitulo, crumb) {
  return el(`
    <div class="page-header">
      <div class="page-title">
        <h1>${titulo}</h1>
        ${subtitulo ? `<p>${subtitulo}</p>` : ''}
      </div>
      ${crumb ? `<div class="page-crumb">${crumb}</div>` : ''}
    </div>`);
}

export function statCard({ etiqueta, valor, delta = null, icono = '▦', tono = '', small = false }) {
  let deltaHtml = '';
  if (delta !== null) {
    const cls = delta === 0 ? 'flat' : delta > 0 ? 'up' : 'down';
    const signo = delta > 0 ? '▲' : delta < 0 ? '▼' : '•';
    deltaHtml = `<span class="stat-delta ${cls}">${signo} ${Math.abs(delta).toFixed(1)}%</span>`;
  }
  return el(`
    <div class="stat-card">
      <div class="stat-icon ${tono}">${icono}</div>
      <div class="stat-meta">
        <span class="stat-label">${etiqueta}</span>
        <span class="stat-value ${small ? 'small' : ''}">${valor}</span>
        ${deltaHtml}
      </div>
    </div>`);
}

export function esqueletoTabla(filas = 4, columnas = 5) {
  const rows = Array.from({ length: filas }, () =>
    `<div class="skeleton-row">${Array.from({ length: columnas }, () => '<span class="sk"></span>').join('')}</div>`).join('');
  return el(`<div class="skeleton skeleton-table">${rows}</div>`);
}

export function cargando(texto = 'Generando reporte...') {
  return el(`<div class="spinner-wrap"><span class="spinner"></span>${texto}</div>`);
}
