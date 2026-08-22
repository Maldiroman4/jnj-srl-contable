/**
 * Generador y descargador directo de archivos PDF para JNJ SRL
 */
export async function exportarElementoAPDF(elemento, opciones = {}) {
  const target = typeof elemento === 'string' ? document.getElementById(elemento) : elemento;
  if (!target) {
    alert('No se encontró el elemento para exportar.');
    return;
  }

  const {
    nombreArchivo = 'Documento_JNJ_SRL.pdf',
    formato = 'letter',
    orientacion = 'portrait',
    margen = [10, 10, 10, 10]
  } = opciones;

  if (window.html2pdf) {
    const opt = {
      margin: margen,
      filename: nombreArchivo.endsWith('.pdf') ? nombreArchivo : `${nombreArchivo}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff'
      },
      jsPDF: {
        unit: 'mm',
        format: formato,
        orientation: orientacion
      },
      pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
    };

    try {
      await window.html2pdf().set(opt).from(target).save();
    } catch (err) {
      console.error('Error al generar PDF con html2pdf:', err);
      window.print();
    }
  } else {
    window.print();
  }
}
