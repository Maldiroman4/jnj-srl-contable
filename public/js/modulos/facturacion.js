import { registrarModulo } from '../registro.js';
import { getEstado, mostrar } from '../app.js';
import { fmtMoneda } from '../ui.js';
import { exportarElementoAPDF } from '../pdf-export.js';

let carrito = [];

export async function render() {
  const estado = getEstado();
  const el = document.getElementById('app-contenido');
  if (!estado.compania) {
    el.innerHTML = '<div class="msg msg-info">Seleccione una compañía para facturar.</div>';
    return;
  }

  // Cargar clientes y productos
  const [clientes, productos, facturas] = await Promise.all([
    (await fetch(`/api/clientes?compania=${estado.compania}`)).json(),
    (await fetch(`/api/productos?compania=${estado.compania}`)).json(),
    (await fetch(`/api/facturas?compania=${estado.compania}`)).json()
  ]);

  el.innerHTML = `
    <div class="monica-facturacion-layout" style="display:flex; flex-direction:column; gap:16px;">
      
      <!-- PESTAÑAS -->
      <div style="display:flex; gap:10px; border-bottom:2px solid #e2e8f0; padding-bottom:8px;">
        <button class="btn btn-primary" id="tab-nueva-fac">➕ Nueva Factura de Venta (POS)</button>
        <button class="btn" id="tab-historial-fac" style="background:#f1f5f9; color:#334155;">📋 Historial de Facturas Emitidas (${facturas.length})</button>
      </div>

      <!-- VISTA 1: FORMULARIO POS -->
      <div id="vista-nueva-factura">
        <div style="display:grid; grid-template-columns: 1.8fr 1fr; gap:20px; align-items:start;">
          
          <!-- PANEL IZQUIERDO -->
          <div style="display:flex; flex-direction:column; gap:16px;">
            
            <!-- Cliente y Condición -->
            <div class="panel" style="padding:16px;">
              <div style="display:grid; grid-template-columns: 2fr 1fr 1fr; gap:14px;">
                <div>
                  <label style="display:block; font-size:12px; font-weight:700; color:#475569; margin-bottom:4px;">Cliente</label>
                  <select id="fac-cliente" style="width:100%; padding:8px 12px; border-radius:8px; border:1px solid #cbd5e1; font-size:14px;">
                    ${clientes.map(c => `<option value="${c.id_cliente}">${c.codigo} - ${c.nombre} (${c.cedula_rnc || 'Sin Doc'})</option>`).join('')}
                  </select>
                </div>
                <div>
                  <label style="display:block; font-size:12px; font-weight:700; color:#475569; margin-bottom:4px;">Condición de Pago</label>
                  <select id="fac-tipo-pago" style="width:100%; padding:8px 12px; border-radius:8px; border:1px solid #cbd5e1; font-size:14px;">
                    <option value="CONTADO">Contado (Efectivo/Banco)</option>
                    <option value="CREDITO">Crédito (30 días)</option>
                  </select>
                </div>
                <div>
                  <label style="display:block; font-size:12px; font-weight:700; color:#475569; margin-bottom:4px;">Fecha Emisión</label>
                  <input type="date" id="fac-fecha" style="width:100%; padding:8px 12px; border-radius:8px; border:1px solid #cbd5e1; font-size:14px;" value="${new Date().toISOString().split('T')[0]}">
                </div>
              </div>
            </div>

            <!-- Buscador Rápido de Productos -->
            <div class="panel" style="padding:14px;">
              <div style="display:flex; gap:10px; align-items:center;">
                <span style="font-size:18px;">🔍</span>
                <select id="fac-select-prod" style="flex:1; padding:10px 14px; border-radius:8px; border:1px solid #0f766e; font-size:14px; font-weight:600; background:#f0fdfa;">
                  <option value="">-- Seleccionar producto para agregar a la factura (F2) --</option>
                  ${productos.map(p => `
                    <option value="${p.id_producto}">
                      [${p.codigo}] ${p.descripcion} — ${fmtMoneda(p.precio_venta)} (Stock: ${p.stock_actual})
                    </option>
                  `).join('')}
                </select>
                <button class="btn btn-primary" id="btn-add-item" style="padding:10px 18px; font-weight:700;">➕ Agregar</button>
              </div>
            </div>

            <!-- Tabla de Items de Factura -->
            <div class="panel" style="min-height:260px;">
              <div class="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Descripción</th>
                      <th class="num" style="width:90px;">Cant.</th>
                      <th class="num" style="width:110px;">Precio</th>
                      <th class="num" style="width:75px;">% Desc</th>
                      <th class="num" style="width:65px;">IVA</th>
                      <th class="num" style="width:120px;">Total</th>
                      <th style="width:40px;"></th>
                    </tr>
                  </thead>
                  <tbody id="tbody-items-fac">
                    <!-- Dinámico -->
                  </tbody>
                </table>
              </div>
            </div>

          </div>

          <!-- PANEL DERECHO: TOTALES & VUELTOS -->
          <div>
            <div class="panel" style="padding:22px; background:#f8fafc; border:1px solid #cbd5e1; border-radius:16px;">
              <h3 style="margin-top:0; font-size:17px; border-bottom:1px solid #e2e8f0; padding-bottom:10px;">Liquidación de Venta</h3>

              <div style="display:flex; flex-direction:column; gap:10px; margin:16px 0; font-size:14px;">
                <div style="display:flex; justify-content:space-between; color:#475569;">
                  <span>Subtotal Neto:</span>
                  <strong id="lbl-subtotal" style="font-family:var(--mono);">$0.00</strong>
                </div>
                <div style="display:flex; justify-content:space-between; color:#16a34a;">
                  <span>Descuento Comercial:</span>
                  <strong id="lbl-descuento" style="font-family:var(--mono);">-$0.00</strong>
                </div>
                <div style="display:flex; justify-content:space-between; color:#475569;">
                  <span>IVA / Impuestos:</span>
                  <strong id="lbl-impuesto" style="font-family:var(--mono);">+$0.00</strong>
                </div>
                <div style="height:1px; background:#cbd5e1; margin:6px 0;"></div>
                <div style="display:flex; justify-content:space-between; font-size:18px; font-weight:800; color:#0f766e;">
                  <span>TOTAL A PAGAR:</span>
                  <span id="lbl-total" style="font-family:var(--mono);">$0.00</span>
                </div>
              </div>

              <!-- Efectivo y Vueltos -->
              <div style="background:#fff; border:1px solid #cbd5e1; border-radius:12px; padding:14px; margin-top:14px;">
                <label style="display:block; font-size:12px; font-weight:700; color:#64748b; margin-bottom:4px;">Efectivo Recibido:</label>
                <input type="number" id="fac-efectivo" style="width:100%; padding:10px 12px; border-radius:8px; border:1px solid #94a3b8; font-family:var(--mono); font-size:18px; font-weight:700; color:#0f172a;" placeholder="0.00" step="0.01">
                
                <div style="display:flex; justify-content:space-between; align-items:center; margin-top:10px; font-size:14px;">
                  <span style="font-weight:600; color:#475569;">Cambio / Vuelto:</span>
                  <strong id="lbl-vuelto" style="font-family:var(--mono); font-size:18px; color:#16a34a;">$0.00</strong>
                </div>
              </div>

              <div style="display:flex; flex-direction:column; gap:10px; margin-top:18px;">
                <button class="btn btn-primary" id="btn-emitir-factura" style="padding:14px; font-size:15px; font-weight:700; border-radius:10px; width:100%;">
                  ✅ Emitir Factura y Contabilizar
                </button>
                <button class="btn" id="btn-limpiar-pos" style="padding:8px; font-size:12px; font-weight:600; color:#64748b; background:transparent; width:100%;">
                  Limpiar Formulario
                </button>
              </div>

            </div>
          </div>

        </div>
      </div>

      <!-- VISTA 2: HISTORIAL DE FACTURAS -->
      <div id="vista-historial-factura" class="hidden">
        <div class="panel">
          <div class="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Factura #</th>
                  <th>Fecha</th>
                  <th>Cliente</th>
                  <th>Condición</th>
                  <th class="num">Subtotal</th>
                  <th class="num">Impuesto</th>
                  <th class="num">Total</th>
                  <th>Estado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                ${facturas.length === 0 ? '<tr><td colspan="9" class="vacio">No hay facturas emitidas.</td></tr>' : ''}
                ${facturas.map(f => `
                  <tr>
                    <td><strong>${f.numero_factura}</strong></td>
                    <td>${f.fecha}</td>
                    <td>${f.cliente_nombre}</td>
                    <td><span style="font-size:11px; font-weight:700; padding:2px 6px; border-radius:4px; background:${f.tipo_pago === 'CONTADO' ? '#dbeafe' : '#fef3c7'}; color:${f.tipo_pago === 'CONTADO' ? '#1d4ed8' : '#b45309'};">${f.tipo_pago}</span></td>
                    <td class="num font-mono">${fmtMoneda(f.subtotal)}</td>
                    <td class="num font-mono">${fmtMoneda(f.impuesto)}</td>
                    <td class="num font-mono" style="font-weight:700; font-size:15px;">${fmtMoneda(f.total)}</td>
                    <td><span style="font-size:11px; font-weight:700; padding:2px 6px; border-radius:4px; background:${f.estado === 'PAGADA' ? '#dcfce7' : '#fef3c7'}; color:${f.estado === 'PAGADA' ? '#15803d' : '#b45309'};">${f.estado}</span></td>
                    <td>
                      <button class="btn btn-sm btn-ver-fac" data-id="${f.id_factura}" style="padding:4px 8px; font-size:12px;">👁️ Ver / Imprimir</button>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>

    </div>
  `;

  function renderCarrito() {
    const tbody = el.querySelector('#tbody-items-fac');
    if (carrito.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" class="vacio">No hay artículos en la factura actual.</td></tr>';
      el.querySelector('#lbl-subtotal').textContent = '$0.00';
      el.querySelector('#lbl-descuento').textContent = '-$0.00';
      el.querySelector('#lbl-impuesto').textContent = '+$0.00';
      el.querySelector('#lbl-total').textContent = '$0.00';
      el.querySelector('#lbl-vuelto').textContent = '$0.00';
      return;
    }

    let subtotal = 0;
    let descuento = 0;
    let impuesto = 0;
    let total = 0;

    tbody.innerHTML = carrito.map((it, idx) => {
      const gross = it.cantidad * it.precio;
      const desc = gross * (it.descuentoPct / 100);
      const net = gross - desc;
      const imp = net * (it.impuestoPct / 100);
      const lineTotal = net + imp;

      subtotal += net;
      descuento += desc;
      impuesto += imp;
      total += lineTotal;

      return `
        <tr>
          <td>${idx + 1}</td>
          <td>
            <strong>${it.descripcion}</strong><br>
            <small style="color:#64748b; font-family:var(--mono);">${it.codigo}</small>
          </td>
          <td class="num">
            <input type="number" min="1" value="${it.cantidad}" class="it-cant" data-idx="${idx}" style="width:65px; text-align:center; padding:4px; border:1px solid #cbd5e1; border-radius:4px;">
          </td>
          <td class="num">
            <input type="number" min="0" step="0.01" value="${it.precio}" class="it-precio" data-idx="${idx}" style="width:85px; text-align:right; padding:4px; border:1px solid #cbd5e1; border-radius:4px;">
          </td>
          <td class="num">
            <input type="number" min="0" max="100" value="${it.descuentoPct}" class="it-desc" data-idx="${idx}" style="width:55px; text-align:center; padding:4px; border:1px solid #cbd5e1; border-radius:4px;">
          </td>
          <td class="num" style="color:#64748b;">${it.impuestoPct}%</td>
          <td class="num" style="font-family:var(--mono); font-weight:700;">${fmtMoneda(lineTotal)}</td>
          <td>
            <button class="it-del" data-idx="${idx}" style="background:none; border:none; color:#dc2626; cursor:pointer; font-size:14px;" title="Quitar">❌</button>
          </td>
        </tr>
      `;
    }).join('');

    el.querySelector('#lbl-subtotal').textContent = fmtMoneda(subtotal);
    el.querySelector('#lbl-descuento').textContent = `-${fmtMoneda(descuento)}`;
    el.querySelector('#lbl-impuesto').textContent = `+${fmtMoneda(impuesto)}`;
    el.querySelector('#lbl-total').textContent = fmtMoneda(total);

    calcularVuelto(total);
  }

  function calcularVuelto(total) {
    const efectivo = Number(el.querySelector('#fac-efectivo').value) || 0;
    const vuelto = Math.max(0, efectivo - total);
    el.querySelector('#lbl-vuelto').textContent = fmtMoneda(vuelto);
  }

  function agregarProductoSeleccionado() {
    const sel = el.querySelector('#fac-select-prod');
    const id = Number(sel.value);
    if (!id) return;

    const p = productos.find(x => x.id_producto === id);
    if (!p) return;

    const existe = carrito.find(x => x.id_producto === id);
    if (existe) {
      existe.cantidad += 1;
    } else {
      carrito.push({
        id_producto: p.id_producto,
        codigo: p.codigo,
        descripcion: p.descripcion,
        precio: p.precio_venta,
        impuestoPct: p.impuesto_pct,
        descuentoPct: 0,
        cantidad: 1
      });
    }

    sel.value = '';
    renderCarrito();
  }

  el.querySelector('#btn-add-item').addEventListener('click', agregarProductoSeleccionado);
  el.querySelector('#fac-select-prod').addEventListener('change', agregarProductoSeleccionado);

  el.querySelector('#tbody-items-fac').addEventListener('change', (e) => {
    const idx = Number(e.target.dataset.idx);
    if (e.target.classList.contains('it-cant')) {
      carrito[idx].cantidad = Math.max(1, Number(e.target.value) || 1);
    } else if (e.target.classList.contains('it-precio')) {
      carrito[idx].precio = Math.max(0, Number(e.target.value) || 0);
    } else if (e.target.classList.contains('it-desc')) {
      carrito[idx].descuentoPct = Math.min(100, Math.max(0, Number(e.target.value) || 0));
    }
    renderCarrito();
  });

  el.querySelector('#tbody-items-fac').addEventListener('click', (e) => {
    if (e.target.classList.contains('it-del')) {
      const idx = Number(e.target.dataset.idx);
      carrito.splice(idx, 1);
      renderCarrito();
    }
  });

  el.querySelector('#fac-efectivo').addEventListener('input', () => {
    const subtotal = carrito.reduce((a, b) => a + (b.cantidad * b.precio), 0);
    calcularVuelto(subtotal);
  });

  el.querySelector('#btn-limpiar-pos').addEventListener('click', () => {
    carrito = [];
    renderCarrito();
  });

  // Pestañas
  const tabNueva = el.querySelector('#tab-nueva-fac');
  const tabHistorial = el.querySelector('#tab-historial-fac');
  const vistaNueva = el.querySelector('#vista-nueva-factura');
  const vistaHistorial = el.querySelector('#vista-historial-factura');

  tabNueva.addEventListener('click', () => {
    tabNueva.style.background = '#0f766e';
    tabNueva.style.color = '#fff';
    tabHistorial.style.background = '#f1f5f9';
    tabHistorial.style.color = '#334155';
    vistaNueva.classList.remove('hidden');
    vistaHistorial.classList.add('hidden');
  });

  tabHistorial.addEventListener('click', () => {
    tabHistorial.style.background = '#0f766e';
    tabHistorial.style.color = '#fff';
    tabNueva.style.background = '#f1f5f9';
    tabNueva.style.color = '#334155';
    vistaHistorial.classList.remove('hidden');
    vistaNueva.classList.add('hidden');
  });

  // Emitir Factura
  el.querySelector('#btn-emitir-factura').addEventListener('click', async () => {
    if (carrito.length === 0) {
      alert('Debe agregar al menos un artículo a la factura.');
      return;
    }

    const clienteId = Number(el.querySelector('#fac-cliente').value);
    const tipoPago = el.querySelector('#fac-tipo-pago').value;
    const fecha = el.querySelector('#fac-fecha').value;

    const payload = {
      id_compania: estado.compania,
      id_cliente: clienteId,
      tipo_pago: tipoPago,
      fecha,
      items: carrito.map(c => ({
        id_producto: c.id_producto,
        cantidad: c.cantidad,
        precio_unitario: c.precio,
        descuento_pct: c.descuentoPct
      }))
    };

    try {
      const res = await fetch('/api/facturas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al emitir factura');

      alert(`¡Factura #${data.numero_factura} emitida y contabilizada exitosamente!`);
      carrito = [];
      render();
    } catch (err) {
      alert(`Fallo al emitir factura: ${err.message}`);
    }
  });

  // Ver / Imprimir Factura
  el.querySelectorAll('.btn-ver-fac').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      const res = await (await fetch(`/api/facturas/${id}`)).json();
      const f = res.factura;
      const det = res.detalle;

      const modal = document.getElementById('modal');
      const tit = document.getElementById('modal-titulo');
      const cuerpo = document.getElementById('modal-cuerpo');

      tit.innerHTML = `<h3>Factura de Venta ${f.numero_factura}</h3>`;
      cuerpo.innerHTML = `
        <div id="factura-pdf-contenedor" style="background:#fff; color:#0f172a; padding:24px; border-radius:12px; font-family:Arial, sans-serif;">
          <div style="display:flex; align-items:center; justify-content:space-between; border-bottom:2px solid #0f766e; padding-bottom:12px; margin-bottom:15px;">
            <div style="display:flex; align-items:center; gap:12px;">
              <img src="img/logo.png" alt="Logo JNJ SRL" style="width:52px; height:52px; object-fit:contain; border-radius:10px;">
              <div>
                <h2 style="margin:0; font-size:20px; color:#0f172a;">JNJ SRL</h2>
                <p style="margin:2px 0 0 0; font-size:12px; color:#64748b;">Comprobante Electrónico de Venta</p>
              </div>
            </div>
            <div style="text-align:right;">
              <span style="display:inline-block; background:#0f766e; color:#fff; font-weight:800; font-size:14px; padding:4px 12px; border-radius:6px;">
                ${f.numero_factura}
              </span>
              <p style="margin:4px 0 0 0; font-size:12px; color:#64748b;">Fecha: <strong>${f.fecha}</strong></p>
            </div>
          </div>

          <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px; font-size:13px; margin-bottom:15px; background:#f8fafc; padding:12px; border-radius:8px;">
            <div>
              <p style="margin:2px 0; color:#64748b; font-size:11px; text-transform:uppercase; font-weight:700;">Datos del Cliente</p>
              <p style="margin:2px 0; font-weight:700; font-size:14px;">${f.cliente_nombre}</p>
              <p style="margin:2px 0; color:#475569;">Cédula / RNC: <strong>${f.cedula_rnc || 'Consumidor Final'}</strong></p>
              <p style="margin:2px 0; color:#475569;">Dirección: ${f.cliente_direccion || 'N/A'}</p>
            </div>
            <div style="text-align:right;">
              <p style="margin:2px 0; color:#64748b; font-size:11px; text-transform:uppercase; font-weight:700;">Condición de Venta</p>
              <p style="margin:2px 0; font-weight:700; color:#0f766e; font-size:14px;">${f.tipo_pago}</p>
              <p style="margin:2px 0; color:#475569;">Estado: <span style="color:#15803d; font-weight:700;">REGISTRADO</span></p>
            </div>
          </div>

          <table style="width:100%; font-size:13px; border-collapse:collapse; margin-bottom:15px;">
            <thead>
              <tr style="border-bottom:2px solid #cbd5e1; background:#f1f5f9; text-align:left;">
                <th style="padding:8px 6px;">Cant.</th>
                <th style="padding:8px 6px;">Descripción del Artículo</th>
                <th style="padding:8px 6px; text-align:right;">Precio Unit.</th>
                <th style="padding:8px 6px; text-align:right;">Total</th>
              </tr>
            </thead>
            <tbody>
              ${det.map(d => `
                <tr style="border-bottom:1px solid #e2e8f0;">
                  <td style="padding:8px 6px; font-weight:700;">${d.cantidad}</td>
                  <td style="padding:8px 6px;">
                    <div>${d.descripcion}</div>
                    ${d.codigo_cabys ? `<small style="color:#0284c7; font-family:var(--mono);">CAByS: ${d.codigo_cabys}</small>` : ''}
                  </td>
                  <td style="padding:8px 6px; text-align:right; font-family:var(--mono);">${fmtMoneda(d.precio_unitario)}</td>
                  <td style="padding:8px 6px; text-align:right; font-weight:700; font-family:var(--mono);">${fmtMoneda(d.total)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>

          <div style="display:flex; justify-content:flex-end; margin-top:10px;">
            <div style="min-width:240px; font-size:13px; text-align:right;">
              <div style="display:flex; justify-content:space-between; padding:4px 0;">
                <span style="color:#64748b;">Subtotal:</span>
                <strong style="font-family:var(--mono);">${fmtMoneda(f.subtotal)}</strong>
              </div>
              <div style="display:flex; justify-content:space-between; padding:4px 0;">
                <span style="color:#64748b;">Impuestos (IVA):</span>
                <strong style="font-family:var(--mono);">${fmtMoneda(f.impuesto)}</strong>
              </div>
              <div style="display:flex; justify-content:space-between; padding:8px 0; border-top:2px solid #0f766e; margin-top:4px; font-size:16px; color:#0f766e;">
                <span>TOTAL:</span>
                <strong style="font-family:var(--mono); font-size:18px;">${fmtMoneda(f.total)}</strong>
              </div>
            </div>
          </div>

          <div style="margin-top:20px; padding-top:10px; border-top:1px dashed #cbd5e1; text-align:center; font-size:11px; color:#94a3b8;">
            Gracias por su compra · Sistema Contable y Administrativo JNJ SRL
          </div>
        </div>

        <div style="margin-top:20px; display:flex; justify-content:center; gap:12px;">
          <button class="btn btn-primary" id="btn-descargar-fac-pdf" style="padding:10px 24px; font-weight:700; font-size:15px; border-radius:10px;">
            📥 Generar y Descargar PDF
          </button>
        </div>
      `;

      modal.classList.remove('hidden');

      document.getElementById('btn-descargar-fac-pdf')?.addEventListener('click', async () => {
        const btn = document.getElementById('btn-descargar-fac-pdf');
        const origText = btn.textContent;
        btn.textContent = '⏳ Generando PDF...';
        btn.disabled = true;
        try {
          await exportarElementoAPDF(document.getElementById('factura-pdf-contenedor'), {
            nombreArchivo: `Factura_${f.numero_factura}.pdf`,
            formato: 'letter'
          });
        } finally {
          btn.textContent = origText;
          btn.disabled = false;
        }
      });
    });
  });

  renderCarrito();
}

registrarModulo('facturacion', { render });
