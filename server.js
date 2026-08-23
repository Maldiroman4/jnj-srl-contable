const path = require('path');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/auth', require('./src/routes/auth'));
app.use('/api/companias', require('./src/routes/companias'));
app.use('/api/cuentas', require('./src/routes/cuentas'));
app.use('/api/asientos', require('./src/routes/asientos'));
app.use('/api/procesos', require('./src/routes/procesos'));
app.use('/api/reportes', require('./src/routes/reportes'));
app.use('/api/backup', require('./src/routes/backup'));
app.use('/api/clientes', require('./src/routes/clientes'));
app.use('/api/proveedores', require('./src/routes/proveedores'));
app.use('/api/productos', require('./src/routes/productos'));
app.use('/api/facturas', require('./src/routes/facturas'));
app.use('/api/cxc', require('./src/routes/cxc'));
app.use('/api/cxp', require('./src/routes/cxp'));
app.use('/api/bancos', require('./src/routes/bancos'));
app.use('/api/dashboard', require('./src/routes/dashboard'));
app.use('/api/seguridad', require('./src/routes/seguridad'));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: err.message });
});

app.listen(PORT, () => {
  console.log(`Sistema Contable listo en: http://localhost:${PORT}`);
});