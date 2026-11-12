const path = require('node:path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env'), quiet: true });

function integer(value, fallback, name) {
  const number = Number(value ?? fallback);
  if (!Number.isInteger(number) || number < 1 || number > 65535) {
    throw new Error(`Configure ${name} com uma porta entre 1 e 65535.`);
  }
  return number;
}

// DB_* e o formato novo; PG* continua funcionando para preservar o projeto.
const database = {
  host: process.env.DB_HOST ?? process.env.PGHOST ?? 'localhost',
  port: integer(process.env.DB_PORT ?? process.env.PGPORT, 5432, 'DB_PORT'),
  user: process.env.DB_USER ?? process.env.PGUSER ?? 'postgres',
  password: process.env.DB_PASSWORD ?? process.env.PGPASSWORD ?? '',
  database: process.env.DB_NAME ?? process.env.PGDATABASE ?? 'sistema_notificacao',
  connectionTimeoutMillis: 5000,
  idleTimeoutMillis: 30000,
  statement_timeout: 10000,
  max: 10,
  application_name: 'sistema_notificacao_api',
};

module.exports = {
  database,
  port: integer(process.env.PORT, 3000, 'PORT'),
  host: process.env.HOST ?? '127.0.0.1',
};
