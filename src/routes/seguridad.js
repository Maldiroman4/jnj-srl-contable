const express = require('express');
const { db } = require('../db');
const router = express.Router();

// GET /api/seguridad/auditoria - Historial completo de accesos con conteo de dispositivo
router.get('/auditoria', (req, res) => {
  const limite = Number(req.query.limite) || 50;

  const registros = db.prepare(`
    SELECT a.*,
           (SELECT COUNT(*) 
            FROM auditoria_sesiones a2 
            WHERE a2.username = a.username 
              AND a2.dispositivo = a.dispositivo 
              AND a2.estado = 'EXITOSO'
              AND a2.id_sesion <= a.id_sesion) AS veces_iniciado
    FROM auditoria_sesiones a
    ORDER BY a.id_sesion DESC
    LIMIT ?
  `).all(limite);

  res.json(registros);
});

// GET /api/seguridad/stats - Métricas para el Super Usuario
router.get('/stats', (req, res) => {
  const total = db.prepare('SELECT COUNT(*) as c FROM auditoria_sesiones').get()?.c || 0;
  const exitosos = db.prepare("SELECT COUNT(*) as c FROM auditoria_sesiones WHERE estado = 'EXITOSO'").get()?.c || 0;
  const fallidos = db.prepare("SELECT COUNT(*) as c FROM auditoria_sesiones WHERE estado = 'FALLIDO'").get()?.c || 0;
  const dispositivosUnicos = db.prepare('SELECT COUNT(DISTINCT dispositivo || user_agent) as c FROM auditoria_sesiones').get()?.c || 0;
  const ipsUnicas = db.prepare('SELECT COUNT(DISTINCT ip) as c FROM auditoria_sesiones').get()?.c || 0;

  const porDispositivo = db.prepare(`
    SELECT dispositivo, COUNT(*) as cantidad, MAX(fecha_hora) as ultimo_acceso
    FROM auditoria_sesiones
    WHERE estado = 'EXITOSO'
    GROUP BY dispositivo
    ORDER BY cantidad DESC
  `).all();

  const ultimasSesiones = db.prepare(`
    SELECT * FROM auditoria_sesiones ORDER BY id_sesion DESC LIMIT 5
  `).all();

  res.json({
    kpis: {
      total,
      exitosos,
      fallidos,
      dispositivosUnicos,
      ipsUnicas
    },
    porDispositivo,
    ultimasSesiones
  });
});

// GET /api/seguridad/usuarios - Lista de usuarios
router.get('/usuarios', (req, res) => {
  const usuarios = db.prepare('SELECT id_usuario, username, nombre_completo, rol, activo, creado_en FROM usuarios ORDER BY id_usuario').all();
  res.json(usuarios);
});

// POST /api/seguridad/usuarios - Crear o actualizar usuario
router.post('/usuarios', (req, res) => {
  const { username, password, nombre_completo, rol } = req.body || {};
  if (!username || !password || !nombre_completo) {
    return res.status(400).json({ error: 'Todos los campos son obligatorios.' });
  }

  try {
    const rolFinal = rol || 'ADMIN';
    const ins = db.prepare(`
      INSERT INTO usuarios (username, password, nombre_completo, rol, activo)
      VALUES (?, ?, ?, ?, 1)
      ON CONFLICT(username) DO UPDATE SET
        password = excluded.password,
        nombre_completo = excluded.nombre_completo,
        rol = excluded.rol
    `).run(username.trim(), password, nombre_completo.trim(), rolFinal);

    res.json({ ok: true, mensaje: 'Usuario guardado exitosamente.', id_usuario: ins.lastInsertRowid });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
