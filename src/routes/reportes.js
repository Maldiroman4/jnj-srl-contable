const express = require('express');
const {
  estadoResultados, balanceGeneral, anexos, catalogo,
  libroDiario, libroMayor, balanceComprobacion, historialCuenta, presupuesto, libroIVA,
} = require('../contabilidad/reportes');
const router = express.Router();

function params(req) {
  const hoyAno = new Date().getFullYear();
  const hoyMes = new Date().getMonth() + 1;
  const fDesde = req.query.desde || req.query.fecha_desde || (req.query.ano && req.query.mes ? `${req.query.ano}-${String(req.query.mes).padStart(2, '0')}-01` : null);
  const fHasta = req.query.hasta || req.query.fecha_hasta || (req.query.ano && req.query.mes ? `${req.query.ano}-${String(req.query.mes).padStart(2, '0')}-31` : null);
  return {
    id_compania: Number(req.query.compania),
    ano: Number(req.query.ano) || (fDesde ? Number(fDesde.slice(0, 4)) : hoyAno),
    mes: Number(req.query.mes) || (fDesde ? Number(fDesde.slice(5, 7)) : hoyMes),
    desde: fDesde,
    hasta: fHasta,
  };
}

router.get('/resultados', (req, res) => {
  const p = params(req);
  if (!p.id_compania) return res.status(400).json({ error: 'compania requerida.' });
  res.json(estadoResultados(p.id_compania, p.ano, p.mes, p.desde, p.hasta));
});

router.get('/balance', (req, res) => {
  const p = params(req);
  if (!p.id_compania) return res.status(400).json({ error: 'compania requerida.' });
  res.json(balanceGeneral(p.id_compania, p.ano, p.mes, p.desde, p.hasta));
});

router.get('/anexos', (req, res) => {
  const p = params(req);
  if (!p.id_compania) return res.status(400).json({ error: 'compania requerida.' });
  res.json(anexos(p.id_compania, p.ano, p.mes, p.desde, p.hasta));
});

router.get('/catalogo', (req, res) => {
  const p = params(req);
  if (!p.id_compania) return res.status(400).json({ error: 'compania requerida.' });
  res.json(catalogo(p.id_compania));
});

// Libros legales
router.get('/diario', (req, res) => {
  const p = params(req);
  if (!p.id_compania) return res.status(400).json({ error: 'compania requerida.' });
  res.json(libroDiario(p.id_compania, p.ano, p.mes, p.desde, p.hasta));
});

router.get('/mayor', (req, res) => {
  const p = params(req);
  if (!p.id_compania) return res.status(400).json({ error: 'compania requerida.' });
  res.json(libroMayor(p.id_compania, p.ano, p.mes, p.desde, p.hasta));
});

router.get('/comprobacion', (req, res) => {
  const p = params(req);
  if (!p.id_compania) return res.status(400).json({ error: 'compania requerida.' });
  res.json(balanceComprobacion(p.id_compania, p.ano, p.mes, p.desde, p.hasta));
});

router.get('/historial', (req, res) => {
  const p = params(req);
  const idCuenta = req.query.cuenta;
  if (!p.id_compania || !idCuenta) {
    return res.status(400).json({ error: 'compania y cuenta son requeridos.' });
  }
  res.json(historialCuenta(p.id_compania, p.ano, p.mes, idCuenta, p.desde, p.hasta));
});

router.get('/presupuesto', (req, res) => {
  const p = params(req);
  if (!p.id_compania) return res.status(400).json({ error: 'compania requerida.' });
  res.json(presupuesto(p.id_compania, p.ano, p.mes, p.desde, p.hasta));
});

router.get('/iva', (req, res) => {
  const p = params(req);
  if (!p.id_compania) return res.status(400).json({ error: 'compania requerida.' });
  res.json(libroIVA(p.id_compania, p.ano, p.mes, p.desde, p.hasta));
});

module.exports = router;