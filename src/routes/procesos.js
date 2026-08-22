const express = require('express');
const { mayorizar, cerrarMes } = require('../contabilidad/mayorizacion');
const { cerrarAnuo } = require('../contabilidad/reportes');
const router = express.Router();

router.post('/mayorizacion', (req, res) => {
  const { id_compania, ano, mes } = req.body || {};
  if (!id_compania || !ano || !mes) return res.status(400).json({ error: 'Compañía, año y mes son requeridos.' });
  const r = mayorizar(Number(id_compania), Number(ano), Number(mes));
  res.json(r);
});

router.post('/cierre-mensual', (req, res) => {
  const { id_compania, ano, mes } = req.body || {};
  if (!id_compania || !ano || !mes) return res.status(400).json({ error: 'Compañía, año y mes son requeridos.' });
  const r = cerrarMes(Number(id_compania), Number(ano), Number(mes));
  res.json(r);
});

router.post('/cierre-anual', (req, res) => {
  const { id_compania, ano, mes } = req.body || {};
  if (!id_compania || !ano || !mes) return res.status(400).json({ error: 'Compañía, año y mes son requeridos.' });
  const r = cerrarAnuo(Number(id_compania), Number(ano), Number(mes));
  res.json(r);
});

module.exports = router;