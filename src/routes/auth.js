const express = require('express');
const router = express.Router();

// Credenciales oficiales de acceso exclusivo solicitadas por el usuario
const ADMIN_USER = process.env.ADMIN_USER || 'Joel777';
const ADMIN_PASS = process.env.ADMIN_PASS || '585858';

router.post('/login', (req, res) => {
  const { usuario, password } = req.body || {};
  if (!usuario || !password) {
    return res.status(400).json({ ok: false, error: 'Debe ingresar usuario y contraseña.' });
  }

  if (usuario === ADMIN_USER && password === ADMIN_PASS) {
    return res.json({
      ok: true,
      usuario: ADMIN_USER,
      token: Buffer.from(`${ADMIN_USER}:${Date.now()}`).toString('base64'),
      mensaje: 'Autenticación exitosa.'
    });
  }

  return res.status(401).json({
    ok: false,
    error: 'Credenciales inválidas. Verifique su usuario y contraseña.'
  });
});

router.get('/check', (req, res) => {
  res.json({ ok: true, sistema: 'JNJ SRL Cloud' });
});

module.exports = router;
