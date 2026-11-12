const { pool, testConnection } = require('./config/database');
const { port, host } = require('./config/env');
const { createApp } = require('./app');

async function start() {
  await testConnection();
  console.log('PostgreSQL conectado. Tabelas de funcionarios, projetos e vinculos acessiveis.');
  const server = createApp(pool).listen(port, host);
  server.on('listening', () => console.log(`Aplicacao disponivel em http://${host}:${port}`));
  server.on('error', async (error) => {
    console.error(error.code === 'EADDRINUSE'
      ? 'Porta em uso. Encerre a outra instancia ou altere PORT em .env.'
      : 'Nao foi possivel iniciar o servidor HTTP.');
    await pool.end();
    process.exitCode = 1;
  });
  let closing = false;
  async function close() {
    if (closing) return;
    closing = true;
    const timeout = setTimeout(() => process.exit(1), 10000).unref();
    server.close(async () => {
      await pool.end();
      clearTimeout(timeout);
    });
  }
  process.on('SIGINT', close);
  process.on('SIGTERM', close);
}

start().catch(async (error) => {
  console.error('Falha ao iniciar. Confira PostgreSQL, aplique a migracao e revise DB_* (ou PG*) em .env.');
  console.error('Codigo:', error.code ?? 'STARTUP_ERROR');
  await pool.end();
  process.exitCode = 1;
});
