const { Pool, types } = require('pg');
const { database } = require('./env');

// DATE nao e um instante: preserva YYYY-MM-DD sem conversao de fuso horario.
types.setTypeParser(1082, (value) => value);
const pool = new Pool(database);

pool.on('error', (error) => {
  // O codigo e suficiente para diagnosticar; nao imprime SQL, dados ou senhas.
  console.error('Conexao PostgreSQL interrompida.', { codigo: error.code ?? 'CONNECTION_ERROR' });
});

async function testConnection(db = pool) {
  await db.query('SELECT 1');
  // Confere as tabelas e a permissao de leitura sem modificar sua estrutura.
  await db.query('SELECT * FROM public.funcionarios LIMIT 0');
  await db.query('SELECT * FROM public.projetos LIMIT 0');
  await db.query('SELECT * FROM public.funcionario_projeto LIMIT 0');
}

module.exports = { pool, testConnection };
