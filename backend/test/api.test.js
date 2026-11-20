const { test } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { createServer } = require('node:net');
const { spawn } = require('node:child_process');
const path = require('node:path');
const { pool, testConnection } = require('../src/config/database');
const { createApp } = require('../src/app');

async function serve(db) {
  const server = createApp(db).listen(0, '127.0.0.1');
  await once(server, 'listening');
  return {
    base: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
      server.closeAllConnections();
    }),
  };
}

async function json(base, route = '/api/funcionarios', method = 'GET', body) {
  const response = await fetch(base + route, {
    method,
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { response, data: response.status === 204 ? null : await response.json() };
}

function asJson(value) {
  return JSON.parse(JSON.stringify(value));
}

test('API com PostgreSQL existente e escritas isoladas', { timeout: 30000 }, async (t) => {
  let publicApp;
  let isolatedApp;
  let client;
  const before = asJson((await pool.query('SELECT * FROM public.funcionarios ORDER BY eid')).rows);
  const projectsBefore = asJson((await pool.query(`
    SELECT fp.funcionario_id, p.id, p.nome, p.status
    FROM public.funcionario_projeto fp
    JOIN public.projetos p ON p.id = fp.projeto_id
    ORDER BY fp.funcionario_id, lower(p.nome), p.id
  `)).rows);
  try {
    publicApp = await serve(pool);
    await t.test('Conexao e permissao de leitura da tabela', async () => {
      await testConnection();
    });
    await t.test('EID confirmado como chave primaria unica', async () => {
      const { rows } = await pool.query(`
        SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint
        WHERE conrelid = 'public.funcionarios'::regclass AND contype = 'p'
      `);
      assert.deepEqual(rows.map((r) => r.definition), ['PRIMARY KEY (eid)']);
    });
    await t.test('GET retorna funcionarios com projetos, incluindo null e datas', async () => {
      const { response, data } = await json(publicApp.base);
      assert.equal(response.status, 200);
      assert.match(response.headers.get('content-type'), /application\/json/);
      assert.equal(response.headers.get('cache-control'), 'no-store');
      assert.deepEqual(data.map(({ projetos, ...employee }) => employee), before);
      for (const employee of data) {
        const expectedProjects = projectsBefore
          .filter((project) => project.funcionario_id === employee.eid)
          .map(({ funcionario_id, ...project }) => project);
        assert.deepEqual(employee.projetos, expectedProjects);
      }
    });
    await t.test('GET por EID retorna o registro exato', async (subtest) => {
      if (!before.length) return subtest.skip('Banco sem cadastros para consulta individual.');
      const { response, data } = await json(publicApp.base, `/api/funcionarios/${encodeURIComponent(before[0].eid)}`);
      assert.equal(response.status, 200);
      assert.deepEqual(data, before[0]);
    });
    await t.test('GET inexistente retorna 404 padronizado', async () => {
      let missing = 'NAO_EXISTE_TESTE';
      while (before.some((r) => r.eid === missing)) missing = `T${Math.random().toString(36).slice(2, 15)}`;
      const { response, data } = await json(publicApp.base, `/api/funcionarios/${missing}`);
      assert.equal(response.status, 404);
      assert.equal(data.error.code, 'NOT_FOUND');
    });
    await t.test('Entrada semelhante a SQL e tratada como valor do EID', async () => {
      const { response } = await json(publicApp.base, `/api/funcionarios/${encodeURIComponent("' OR '1'='1")}`);
      assert.equal(response.status, 404);
    });
    await t.test('Frontend e assets sao servidos pela mesma origem', async () => {
      for (const asset of ['/', '/style.css', '/script.js']) {
        const response = await fetch(publicApp.base + asset);
        assert.equal(response.status, 200);
        assert.ok((await response.text()).length > 0);
      }
    });
    await t.test('Arquivos de configuracao nao sao publicados', async () => {
      for (const file of ['/.env', '/package.json', '/backend/src/config/database.js']) {
        const { response } = await json(publicApp.base, file);
        assert.equal(response.status, 404);
      }
    });

    client = await pool.connect();
    await client.query('BEGIN');
    await client.query('CREATE TEMP TABLE funcionarios (LIKE public.funcionarios INCLUDING ALL) ON COMMIT DROP');
    // A unica mudanca nas consultas sob teste e o destino: pg_temp, nunca public.
    isolatedApp = await serve({
      query: (text, values) => client.query(text.replaceAll('public.funcionarios', 'pg_temp.funcionarios'), values),
    });
    await t.test('POST isolado: 201, acentos, data sem fuso, null e status padrao', async () => {
      const { response, data } = await json(isolatedApp.base, '/api/funcionarios', 'POST', {
        eid: '00001', nome: 'João de Teste', nova_expiracao: '2028-02-29', login_elevado: null,
      });
      assert.equal(response.status, 201);
      assert.equal(response.headers.get('location'), '/api/funcionarios/00001');
      assert.equal(data.eid, '00001');
      assert.equal(data.nome, 'João de Teste');
      assert.equal(data.nova_expiracao, '2028-02-29');
      assert.equal(data.login_elevado, null);
      assert.equal(data.status, 'pendente');
      assert.ok(!Number.isNaN(Date.parse(data.criado_em)));
    });
    await t.test('POST rejeita dados invalidos sem escrever na tabela', async () => {
      const bodies = [
        {}, { eid: 'NOVO' }, { eid: 'NOVO', nome: ' ' },
        { eid: 123, nome: 'Teste' }, { eid: 'A'.repeat(21), nome: 'Teste' },
        { eid: 'NOVO', nome: 'Teste', status: 'desconhecido' },
        { eid: 'NOVO', nome: 'Teste', nova_expiracao: '2027-02-29' },
        { eid: 'NOVO', nome: 'Teste', nova_expiracao: '0000-01-01' },
        { eid: 'NOVO', nome: 'Teste', criado_em: '2020-01-01' },
        JSON.parse('{"eid":"NOVO","nome":"Teste","__proto__":"campo desconhecido"}'),
        { eid: 'NOVO', nome: null }, { eid: 'NOVO', nome: 'Teste', status: null },
        [], null,
      ];
      for (const body of bodies) {
        const { response, data } = await json(isolatedApp.base, '/api/funcionarios', 'POST', body);
        assert.equal(response.status, 400, JSON.stringify(body));
        assert.equal(typeof data.error.message, 'string');
      }
      assert.equal((await client.query('SELECT count(*)::int AS total FROM pg_temp.funcionarios')).rows[0].total, 1);
    });
    await t.test('EID duplicado retorna 409 sem detalhes internos', async () => {
      // Savepoint para recuperar a transacao de teste apos a restricao do banco.
      await client.query('SAVEPOINT duplicate_test');
      try {
        const { response, data } = await json(isolatedApp.base, '/api/funcionarios', 'POST', { eid: '00001', nome: 'Duplicado' });
        assert.equal(response.status, 409);
        assert.deepEqual(Object.keys(data.error).sort(), ['code', 'message']);
      } finally {
        await client.query('ROLLBACK TO SAVEPOINT duplicate_test');
      }
    });
    await t.test('PUT atualiza apenas os campos enviados e preserva EID/nome', async () => {
      const { response, data } = await json(isolatedApp.base, '/api/funcionarios/00001', 'PUT', {
        status: 'ativo', torre: 'Infraestrutura', nova_expiracao: null, observacao: "Texto ' com aspas; <teste>",
      });
      assert.equal(response.status, 200);
      assert.equal(data.eid, '00001');
      assert.equal(data.nome, 'João de Teste');
      assert.equal(data.nova_expiracao, null);
      assert.equal(data.status, 'ativo');
      assert.equal(data.observacao, "Texto ' com aspas; <teste>");
    });
    await t.test('PUT rejeita mudanca de EID e atualizacao vazia', async () => {
      for (const body of [{ eid: 'OUTRO' }, {}]) {
        const { response } = await json(isolatedApp.base, '/api/funcionarios/00001', 'PUT', body);
        assert.equal(response.status, 400);
      }
    });
    await t.test('PUT inexistente retorna 404', async () => {
      const { response } = await json(isolatedApp.base, '/api/funcionarios/INEXISTENTE', 'PUT', { nome: 'Teste' });
      assert.equal(response.status, 404);
    });
    await t.test('JSON malformado e tipo de conteudo incorreto sao rejeitados', async () => {
      const invalid = await fetch(isolatedApp.base + '/api/funcionarios', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{invalido',
      });
      assert.equal(invalid.status, 400);
      assert.equal((await invalid.json()).error.code, 'INVALID_REQUEST');
      const unsupported = await fetch(isolatedApp.base + '/api/funcionarios', { method: 'POST', body: 'texto' });
      assert.equal(unsupported.status, 415);
    });
    await t.test('DELETE e verificado com conexao simulada, sem executar exclusoes', async () => {
      const queries = [];
      const simulated = await serve({ query: async (text, values) => {
        queries.push({ text, values });
        return { rows: values[0] === 'FICTICIO' ? [{ eid: 'FICTICIO' }] : [] };
      } });
      try {
        const removed = await json(simulated.base, '/api/funcionarios/FICTICIO', 'DELETE');
        assert.equal(removed.response.status, 204);
        assert.equal(removed.data, null);
        const missing = await json(simulated.base, '/api/funcionarios/OUTRO', 'DELETE');
        assert.equal(missing.response.status, 404);
        assert.equal(queries[0].text, 'DELETE FROM public.funcionario_projeto WHERE funcionario_id = $1');
        assert.deepEqual(queries[0].values, ['FICTICIO']);
        assert.equal(queries[1].text, 'DELETE FROM public.funcionarios WHERE eid = $1 RETURNING eid');
        assert.deepEqual(queries[1].values, ['FICTICIO']);
      } finally { await simulated.close(); }
    });
    await t.test('Erro interno nao expoe detalhes do PostgreSQL', async () => {
      const simulated = await serve({ query: async () => { throw new Error('SQL e credenciais internas'); } });
      try {
        const { response, data } = await json(simulated.base);
        assert.equal(response.status, 500);
        assert.deepEqual(data, { error: { code: 'INTERNAL_ERROR', message: 'Nao foi possivel concluir a operacao.' } });
      } finally { await simulated.close(); }
    });
    await t.test('Indisponibilidade do banco retorna 503', async () => {
      const simulated = await serve({ query: async () => { throw Object.assign(new Error(), { code: 'ECONNREFUSED' }); } });
      try {
        const { response, data } = await json(simulated.base);
        assert.equal(response.status, 503);
        assert.equal(data.error.code, 'DATABASE_UNAVAILABLE');
      } finally { await simulated.close(); }
    });
    await t.test('server.js inicia com PostgreSQL e atende HTTP', async () => {
      const reservation = createServer().listen(0, '127.0.0.1');
      await once(reservation, 'listening');
      const port = reservation.address().port;
      await new Promise((resolve) => reservation.close(resolve));
      const child = spawn(process.execPath, [path.resolve(__dirname, '../src/server.js')], {
        env: { ...process.env, PORT: String(port), HOST: '127.0.0.1' },
        stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
      });
      try {
        await new Promise((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error('Servidor nao iniciou em 10 segundos.')), 10000);
          child.once('error', (error) => { clearTimeout(timer); reject(error); });
          child.once('exit', (code) => { clearTimeout(timer); reject(new Error(`Servidor encerrou com codigo ${code}.`)); });
          child.stdout.on('data', (chunk) => {
            if (chunk.toString().includes('Aplicacao disponivel')) { clearTimeout(timer); resolve(); }
          });
        });
        const { response, data } = await json(`http://127.0.0.1:${port}`, '/api/health');
        assert.equal(response.status, 200);
        assert.deepEqual(data, { status: 'ok' });
      } finally {
        const exited = once(child, 'exit');
        child.kill();
        await exited;
      }
    });
  } finally {
    if (isolatedApp) await isolatedApp.close();
    if (client) {
      await client.query('ROLLBACK');
      client.release();
    }
    if (publicApp) await publicApp.close();
    try {
      const after = asJson((await pool.query('SELECT * FROM public.funcionarios ORDER BY eid')).rows);
      assert.deepEqual(after, before, 'Os registros reais devem permanecer exatamente iguais.');
    } finally { await pool.end(); }
  }
});
