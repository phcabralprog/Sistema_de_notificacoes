const { pool, testConnection } = require('../src/config/database');

(async () => {
  try {
    await testConnection();
    console.log('PostgreSQL conectado; tabelas de funcionarios, projetos e vinculos acessiveis. Nenhum dado alterado.');
  } catch (error) {
    console.error('Falha na conexao. Confira o servico PostgreSQL e DB_* (ou PG*) em .env.');
    console.error('Codigo:', error.code ?? 'CONNECTION_ERROR');
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
