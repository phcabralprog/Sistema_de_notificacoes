const express = require('express');
const path = require('node:path');
const funcionariosRoutes = require('./routes/funcionarios.routes');
const projetosRoutes = require('./routes/projetos.routes');
const { HttpError, errorHandler } = require('./middleware/errors');

// Injecao da conexao permite testar a mesma API com uma tabela temporaria.
function createApp(db) {
  const app = express();
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Referrer-Policy', 'no-referrer');
    res.set('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
    next();
  });
  app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (['POST', 'PUT'].includes(req.method) && !req.is('application/json')) {
      return next(new HttpError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Use Content-Type: application/json.'));
    }
    next();
  });
  app.use(express.json({ limit: '64kb' }));
  app.get('/api/health', async (req, res) => {
    await db.query('SELECT 1');
    res.json({ status: 'ok' });
  });
  app.use('/api/funcionarios', funcionariosRoutes(db));
  app.use('/api/projetos', projetosRoutes(db));
  app.use(express.static(path.resolve(__dirname, '../../frontend')));
  app.use((req, res, next) => next(new HttpError(404, 'ROUTE_NOT_FOUND', 'Rota nao encontrada.')));
  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
