const express = require('express');
const { db } = require('../db');
const router = express.Router();

// Helper para extraer la IP real del cliente
function obtenerIP(req) {
  const xfwd = req.headers['x-forwarded-for'];
  if (xfwd) {
    const ips = xfwd.split(',').map(s => s.trim());
    if (ips.length > 0 && ips[0]) return ips[0].replace(/^::ffff:/, '');
  }
  const xreal = req.headers['x-real-ip'] || req.headers['x-render-client-ip'];
  if (xreal) return xreal.replace(/^::ffff:/, '');
  const ip = req.socket?.remoteAddress || req.ip || '127.0.0.1';
  return ip.replace(/^::ffff:/, '');
}

// Helper para analizar dispositivo, sistema operativo y navegador
function analizarUserAgent(ua = '') {
  let dispositivo = '💻 Desktop';
  let so = 'Desconocido';
  let navegador = 'Navegador Web';

  // Dispositivo & SO
  if (/iPad/i.test(ua) || (/Macintosh/i.test(ua) && 'ontouchend' in {})) {
    dispositivo = '📲 Tablet (iPad)';
    so = 'iPadOS / iOS';
  } else if (/iPhone/i.test(ua)) {
    dispositivo = '📱 Móvil (iPhone)';
    so = 'iOS';
  } else if (/Android/i.test(ua)) {
    dispositivo = /Tablet|Tab/i.test(ua) ? '📲 Tablet (Android)' : '📱 Móvil (Android)';
    so = 'Android';
  } else if (/Windows NT/i.test(ua)) {
    dispositivo = '💻 Desktop (PC)';
    so = 'Windows';
  } else if (/Macintosh|Mac OS X/i.test(ua)) {
    dispositivo = '💻 Desktop (Mac)';
    so = 'macOS';
  } else if (/Linux/i.test(ua)) {
    dispositivo = '💻 Desktop (Linux)';
    so = 'Linux';
  }

  // Navegador
  if (/Edg\//i.test(ua)) navegador = 'Microsoft Edge';
  else if (/Chrome\//i.test(ua) && !/Chromium|Edg/i.test(ua)) navegador = 'Google Chrome';
  else if (/Safari\//i.test(ua) && !/Chrome/i.test(ua)) navegador = 'Apple Safari';
  else if (/Firefox\//i.test(ua)) navegador = 'Mozilla Firefox';
  else if (/Opera|OPR\//i.test(ua)) navegador = 'Opera';

  return { dispositivo, so, navegador };
}

// Helper para estimar ubicación
function estimarUbicacion(ip, req) {
  const headerPais = req.headers['cf-ipcountry'] || req.headers['x-country-code'] || req.headers['x-render-client-country'];
  if (headerPais) {
    return { pais: headerPais, ciudad: 'Ubicación Cloud' };
  }
  if (ip === '127.0.0.1' || ip === '::1' || ip.startsWith('192.168.') || ip.startsWith('10.') || ip.startsWith('172.16.')) {
    return { pais: 'Costa Rica', ciudad: 'Red Local / Servidor' };
  }
  return { pais: 'Costa Rica / En Línea', ciudad: 'Conexión Segura' };
}

// POST /api/auth/login
router.post('/login', (req, res) => {
  const { usuario, password } = req.body || {};
  const ip = obtenerIP(req);
  const ua = req.headers['user-agent'] || '';
  const { dispositivo, so, navegador } = analizarUserAgent(ua);
  const { pais, ciudad } = estimarUbicacion(ip, req);

  if (!usuario || !password) {
    db.prepare(`
      INSERT INTO auditoria_sesiones 
        (username, ip, pais, ciudad, dispositivo, navegador, sistema_operativo, user_agent, estado, motivo_fallo)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'FALLIDO', 'Campos requeridos vacíos')
    `).run(usuario || 'DESCONOCIDO', ip, pais, ciudad, dispositivo, navegador, so, ua);

    return res.status(400).json({ ok: false, error: 'Debe ingresar usuario y contraseña.' });
  }

  // Validar en la tabla usuarios o fallback en credenciales maestras
  let user = db.prepare('SELECT * FROM usuarios WHERE username = ? AND activo = 1').get(usuario.trim());

  // Fallback si no está en tabla aún
  if (!user && (usuario.trim() === 'Maldiroman777' && password === '858585')) {
    user = { username: 'Maldiroman777', password: '858585', nombre_completo: 'Maldiroman · Super Usuario Maestro', rol: 'SUPER_ADMIN' };
  } else if (!user && (usuario.trim() === 'Joel777' && password === '585858')) {
    user = { username: 'Joel777', password: '585858', nombre_completo: 'Joel · Administrador Principal', rol: 'SUPER_ADMIN' };
  }

  if (user && user.password === password) {
    // Registrar sesión exitosa
    db.prepare(`
      INSERT INTO auditoria_sesiones 
        (username, ip, pais, ciudad, dispositivo, navegador, sistema_operativo, user_agent, estado)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'EXITOSO')
    `).run(user.username, ip, pais, ciudad, dispositivo, navegador, so, ua);

    // Contar inicios de sesión históricos de este dispositivo o IP
    const totalInicios = db.prepare(`
      SELECT COUNT(*) as total 
      FROM auditoria_sesiones 
      WHERE username = ? AND (dispositivo = ? OR ip = ?) AND estado = 'EXITOSO'
    `).get(user.username, dispositivo, ip)?.total || 1;

    const token = Buffer.from(`${user.username}:${user.rol}:${Date.now()}`).toString('base64');

    return res.json({
      ok: true,
      usuario: user.username,
      nombre_completo: user.nombre_completo,
      rol: user.rol,
      token,
      sesion_info: {
        total_inicios_dispositivo: totalInicios,
        dispositivo,
        sistema_operativo: so,
        navegador,
        ip,
        ubicacion: `${ciudad}, ${pais}`,
        fecha_hora: new Date().toISOString()
      },
      mensaje: 'Autenticación exitosa.'
    });
  }

  // Registrar intento fallido
  db.prepare(`
    INSERT INTO auditoria_sesiones 
      (username, ip, pais, ciudad, dispositivo, navegador, sistema_operativo, user_agent, estado, motivo_fallo)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'FALLIDO', 'Contraseña incorrecta')
  `).run(usuario.trim(), ip, pais, ciudad, dispositivo, navegador, so, ua);

  return res.status(401).json({
    ok: false,
    error: 'Credenciales incorrectas. Verifique el usuario y la contraseña.'
  });
});

router.get('/check', (req, res) => {
  res.json({ ok: true, sistema: 'JNJ SRL Cloud Multi-Tenant', version: '2.0' });
});

module.exports = router;
