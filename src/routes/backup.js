const express = require('express');
const path = require('path');
const fs = require('fs');
const { db } = require('../db');
const router = express.Router();

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');

const pad = (n) => String(n).padStart(2, '0');

// Crea un respaldo físico de la base con VACUUM INTO (snapshot consistente).
router.post('/crear', (req, res) => {
  try {
    if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const d = new Date();
    const name = `contabilidad_${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}.db`;
    const dest = path.join(BACKUP_DIR, name);
    db.exec(`VACUUM INTO '${dest.replace(/'/g, "''")}'`);
    const stat = fs.statSync(dest);
    const nCuentas = db.prepare('SELECT COUNT(*) AS n FROM catalogo_cuentas').get().n;
    const nAsientos = db.prepare('SELECT COUNT(*) AS n FROM documentos_asientos').get().n;
    res.json({
      ok: true, file: name, size: stat.size,
      fecha: new Date().toISOString(), cuentas: nCuentas, asientos: nAsientos,
    });
  } catch (e) {
    res.status(500).json({ error: 'No se pudo crear el respaldo: ' + e.message });
  }
});

router.get('/listar', (req, res) => {
  if (!fs.existsSync(BACKUP_DIR)) return res.json([]);
  const files = fs.readdirSync(BACKUP_DIR)
    .filter((f) => f.endsWith('.db'))
    .map((f) => {
      const st = fs.statSync(path.join(BACKUP_DIR, f));
      return { file: f, size: st.size, fecha: st.mtime.toISOString() };
    })
    .sort((a, b) => b.fecha.localeCompare(a.fecha));
  res.json(files);
});

router.get('/descargar', (req, res) => {
  const name = path.basename(req.query.file || '');
  const file = path.join(BACKUP_DIR, name);
  if (!name || !fs.existsSync(file)) {
    return res.status(404).json({ error: 'Respaldo no encontrado.' });
  }
  res.download(file, name);
});

// Restauración: recibe el binario de un .db y lo guarda como importado.db.
// El servidor debe reiniciarse para que db.js lo aplique al abrir la base.
router.post('/restaurar', (req, res) => {
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    try {
      const buf = Buffer.concat(chunks);
      if (buf.length < 16 || buf.toString('latin1', 0, 16) !== 'SQLite format 3\u0000') {
        return res.status(400).json({ error: 'El archivo no es una base de datos SQLite válida.' });
      }
      fs.writeFileSync(path.join(DATA_DIR, 'importado.db'), buf);
      res.json({
        ok: true,
        mensaje: 'Archivo recibido. Reinicie el servidor para aplicar la restauración.',
      });
    } catch (e) {
      res.status(500).json({ error: 'Error al restaurar: ' + e.message });
    }
  });
  req.on('error', () => res.status(400).json({ error: 'Error al recibir el archivo.' }));
});

module.exports = router;