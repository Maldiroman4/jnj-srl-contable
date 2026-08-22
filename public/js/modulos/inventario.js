import { registrarModulo } from '../registro.js';
import { getEstado, mostrar } from '../app.js';
import { fmtMoneda } from '../ui.js';
import { exportarElementoAPDF } from '../pdf-export.js';

export async function render() {
  const estado = getEstado();
  const el = document.getElementById('app-contenido');
  if (!estado.compania) {
    el.innerHTML = '<div class="msg msg-info">Seleccione una compañía para ver el inventario.</div>';
    return;
  }

  const productos = await (await fetch(`/api/productos?compania=${estado.compania}`)).json();

  el.innerHTML = `
    <div class="monica-inventario-layout" style="display:flex; flex-direction:column; gap:16px;">
      
      <div class="panel" style="display:flex; justify-content:space-between; align-items:center; padding:18px 22px;">
        <div>
          <h3 style="margin:0; font-size:18px;">Catálogo de Artículos y Kárdex (${productos.length})</h3>
          <p style="margin:4px 0 0 0; color:#64748b; font-size:13px;">Control de existencias, precios, costos unitarios y movimientos</p>
        </div>
        <button class="btn btn-primary" id="btn-nuevo-producto" style="padding:10px 18px; font-weight:700;">
          ➕ Crear Artículo / Producto
        </button>
      </div>

      <!-- TABLA DE ARTÍCULOS -->
      <div class="panel">
        <div class="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Código / SKU</th>
                <th>Descripción & CAByS</th>
                <th>Categoría</th>
                <th>Unidad</th>
                <th class="num">Costo Unit.</th>
                <th class="num">Precio Venta</th>
                <th class="num">IVA %</th>
                <th class="num">Stock Actual</th>
                <th>Kárdex</th>
              </tr>
            </thead>
            <tbody>
              ${productos.map(p => `
                <tr>
                  <td><span style="font-family:var(--mono); font-weight:700; background:#f1f5f9; padding:2px 8px; border-radius:4px;">${p.codigo}</span></td>
                  <td>
                    <strong>${p.descripcion}</strong>
                    <div style="font-size:11px; color:#64748b; margin-top:2px; font-family:var(--mono);">
                      ${p.codigo_barra ? `<span>Barras: ${p.codigo_barra}</span>` : ''}
                      ${p.codigo_cabys ? `<span style="background:#e0f2fe; color:#0369a1; padding:1px 5px; border-radius:3px; font-weight:600; margin-left:${p.codigo_barra ? '6px' : '0'};">CAByS: ${p.codigo_cabys}</span>` : ''}
                    </div>
                  </td>
                  <td><span style="font-size:11px; padding:2px 8px; border-radius:4px; background:#f1f5f9; color:#475569;">${p.categoria || 'General'}</span></td>
                  <td>${p.unidad}</td>
                  <td class="num font-mono">${fmtMoneda(p.costo_unitario)}</td>
                  <td class="num font-mono" style="font-weight:700; color:#0f766e;">${fmtMoneda(p.precio_venta)}</td>
                  <td class="num" style="color:#64748b;">${p.impuesto_pct}%</td>
                  <td class="num font-mono font-bold" style="color:${p.stock_actual <= p.stock_minimo && p.categoria !== 'Servicios' ? '#dc2626' : '#15803d'}; font-size:14px;">
                    ${p.stock_actual}
                  </td>
                  <td>
                    <button class="btn btn-sm btn-kardex" data-id="${p.id_producto}" style="padding:4px 8px; font-size:12px;">
                      📊 Kárdex
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

  // Modal Crear Producto
  el.querySelector('#btn-nuevo-producto')?.addEventListener('click', () => {
    const modal = document.getElementById('modal');
    const tit = document.getElementById('modal-titulo');
    const cuerpo = document.getElementById('modal-cuerpo');

    tit.innerHTML = '<h3>Nuevo Producto / Artículo</h3>';
    cuerpo.innerHTML = `
      <form id="form-nuevo-prod" style="display:flex; flex-direction:column; gap:12px;">
        <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:12px;">
          <div>
            <label style="display:block; font-size:12px; font-weight:700; color:#475569; margin-bottom:4px;">Código / SKU *</label>
            <input type="text" id="np-codigo" required placeholder="ART-005" style="width:100%; padding:8px 12px; border-radius:8px; border:1px solid #cbd5e1;">
          </div>
          <div>
            <label style="display:block; font-size:12px; font-weight:700; color:#475569; margin-bottom:4px;">Código de Barras</label>
            <input type="text" id="np-barras" placeholder="750123456789" style="width:100%; padding:8px 12px; border-radius:8px; border:1px solid #cbd5e1;">
          </div>
          <div>
            <label style="display:block; font-size:12px; font-weight:700; color:#475569; margin-bottom:4px;">Código CAByS (Hacienda)</label>
            <input type="text" id="np-cabys" maxlength="13" placeholder="Ej: 4911100000000" style="width:100%; padding:8px 12px; border-radius:8px; border:1px solid #cbd5e1; font-family:var(--mono);">
          </div>
        </div>

        <div>
          <label style="display:block; font-size:12px; font-weight:700; color:#475569; margin-bottom:4px;">Descripción del Producto *</label>
          <input type="text" id="np-desc" required placeholder="Batería 12V 60Ah Premium" style="width:100%; padding:8px 12px; border-radius:8px; border:1px solid #cbd5e1;">
        </div>

        <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:12px;">
          <div>
            <label style="display:block; font-size:12px; font-weight:700; color:#475569; margin-bottom:4px;">Categoría</label>
            <input type="text" id="np-cat" value="Repuestos" style="width:100%; padding:8px 12px; border-radius:8px; border:1px solid #cbd5e1;">
          </div>
          <div>
            <label style="display:block; font-size:12px; font-weight:700; color:#475569; margin-bottom:4px;">Unidad</label>
            <select id="np-unidad" style="width:100%; padding:8px 12px; border-radius:8px; border:1px solid #cbd5e1;">
              <option value="UND">Unidad (UND)</option>
              <option value="GAL">Galón (GAL)</option>
              <option value="KG">Kilogramo (KG)</option>
              <option value="SRV">Servicio (SRV)</option>
            </select>
          </div>
          <div>
            <label style="display:block; font-size:12px; font-weight:700; color:#475569; margin-bottom:4px;">IVA %</label>
            <input type="number" id="np-iva" value="13" step="0.5" style="width:100%; padding:8px 12px; border-radius:8px; border:1px solid #cbd5e1;">
          </div>
        </div>

        <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:12px;">
          <div>
            <label style="display:block; font-size:12px; font-weight:700; color:#475569; margin-bottom:4px;">Costo Unitario *</label>
            <input type="number" id="np-costo" required value="0" step="0.01" style="width:100%; padding:8px 12px; border-radius:8px; border:1px solid #cbd5e1;">
          </div>
          <div>
            <label style="display:block; font-size:12px; font-weight:700; color:#475569; margin-bottom:4px;">Precio de Venta *</label>
            <input type="number" id="np-precio" required value="0" step="0.01" style="width:100%; padding:8px 12px; border-radius:8px; border:1px solid #cbd5e1;">
          </div>
          <div>
            <label style="display:block; font-size:12px; font-weight:700; color:#475569; margin-bottom:4px;">Stock Inicial</label>
            <input type="number" id="np-stock" value="10" step="1" style="width:100%; padding:8px 12px; border-radius:8px; border:1px solid #cbd5e1;">
          </div>
        </div>

        <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:14px;">
          <button type="button" class="btn btn-secondary" onclick="document.getElementById('modal').classList.add('hidden')">Cancelar</button>
          <button type="submit" class="btn btn-primary">Guardar Producto</button>
        </div>
      </form>
    `;

    modal.classList.remove('hidden');

    document.getElementById('form-nuevo-prod').addEventListener('submit', async (e) => {
      e.preventDefault();
      const payload = {
        id_compania: estado.compania,
        codigo: document.getElementById('np-codigo').value,
        codigo_barra: document.getElementById('np-barras').value,
        codigo_cabys: document.getElementById('np-cabys').value,
        descripcion: document.getElementById('np-desc').value,
        categoria: document.getElementById('np-cat').value,
        unidad: document.getElementById('np-unidad').value,
        impuesto_pct: Number(document.getElementById('np-iva').value),
        costo_unitario: Number(document.getElementById('np-costo').value),
        precio_venta: Number(document.getElementById('np-precio').value),
        stock_actual: Number(document.getElementById('np-stock').value)
      };

      const res = await fetch('/api/productos', {
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

  // Ver Kárdex
  el.querySelectorAll('.btn-kardex').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      const res = await (await fetch(`/api/productos/${id}/kardex`)).json();
      const p = res.producto;
      const movs = res.movimientos;

      const modal = document.getElementById('modal');
      const tit = document.getElementById('modal-titulo');
      const cuerpo = document.getElementById('modal-cuerpo');

      tit.innerHTML = `<h3>Kárdex de Movimientos: [${p.codigo}] ${p.descripcion}</h3>`;
      cuerpo.innerHTML = `
        <div id="kardex-pdf-contenedor" style="display:flex; flex-direction:column; gap:14px; padding:10px; background:#fff;">
          <div style="display:flex; justify-content:space-between; flex-wrap:wrap; gap:8px; background:#f8fafc; border:1px solid #e2e8f0; padding:12px 16px; border-radius:8px; font-size:13px;">
            <div><strong>Existencia Actual:</strong> ${p.stock_actual} ${p.unidad}</div>
            <div><strong>Costo Promedio:</strong> ${fmtMoneda(p.costo_unitario)}</div>
            <div><strong>Precio Venta:</strong> ${fmtMoneda(p.precio_venta)}</div>
            ${p.codigo_cabys ? `<div><strong>CAByS:</strong> <span style="font-family:var(--mono); color:#0369a1;">${p.codigo_cabys}</span></div>` : ''}
          </div>

          <div class="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Tipo</th>
                  <th>Referencia</th>
                  <th>Detalle</th>
                  <th class="num">Cantidad</th>
                  <th class="num">Costo Unit.</th>
                  <th class="num">Saldo Cant.</th>
                </tr>
              </thead>
              <tbody>
                ${movs.length === 0 ? '<tr><td colspan="7" class="vacio">No hay movimientos registrados.</td></tr>' : ''}
                ${movs.map(m => `
                  <tr>
                    <td>${m.fecha}</td>
                    <td><span style="font-size:11px; font-weight:700; padding:2px 6px; border-radius:4px; background:${m.tipo === 'ENTRADA' ? '#dcfce7' : '#fee2e2'}; color:${m.tipo === 'ENTRADA' ? '#15803d' : '#dc2626'};">${m.tipo}</span></td>
                    <td><strong>${m.referencia || 'N/A'}</strong></td>
                    <td>${m.detalle || ''}</td>
                    <td class="num font-bold" style="color:${m.tipo === 'ENTRADA' ? '#15803d' : '#dc2626'};">
                      ${m.tipo === 'ENTRADA' ? '+' : '-'}${m.cantidad}
                    </td>
                    <td class="num font-mono">${fmtMoneda(m.costo_unitario)}</td>
                    <td class="num font-mono font-bold">${m.saldo_cantidad}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>

        <div style="margin-top:16px; display:flex; justify-content:center;">
          <button class="btn btn-primary" id="btn-descargar-kardex-pdf" style="padding:10px 22px; font-weight:700; border-radius:8px;">
            📥 Descargar Kárdex en PDF
          </button>
        </div>
      `;
      modal.classList.remove('hidden');

      document.getElementById('btn-descargar-kardex-pdf')?.addEventListener('click', async () => {
        const btn = document.getElementById('btn-descargar-kardex-pdf');
        const orig = btn.textContent;
        btn.textContent = '⏳ Generando PDF...';
        btn.disabled = true;
        try {
          await exportarElementoAPDF(document.getElementById('kardex-pdf-contenedor'), {
            nombreArchivo: `Kardex_${p.codigo}.pdf`,
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

registrarModulo('inventario', { render });
