const { test, expect } = require('@playwright/test');
// Os testes ficam fora da pasta publicada pelo Express.

test('Consulta real, tabela com doze colunas e atualizacao pelo botao', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const response = page.waitForResponse((res) => res.url().endsWith('/api/funcionarios'));
  await page.goto('/');
  const data = await (await response).json();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Dashboard.');
  await expect(page.getByRole('link', { name: /Dashboard/ })).toBeVisible();
  await expect(page.locator('#total')).toHaveText(String(data.length));
  await expect(page.locator('#employees-view thead th')).toHaveCount(12);
  await expect(page.locator('#employees tr')).toHaveCount(data.length);
  await expect(page.locator('#load-button')).toBeEnabled();
  const reloaded = page.waitForResponse((res) => res.url().endsWith('/api/funcionarios'));
  await page.getByRole('button', { name: 'Refresh' }).click();
  expect((await reloaded).status()).toBe(200);
  await expect(page.locator('#load-button')).toBeEnabled();
  expect(errors).toEqual([]);
  await page.screenshot({ path: 'artifacts/funcionarios-desktop.png', fullPage: true });
});

const records = [
  { eid: '00001', nome: 'João da Silva', projetos: [{ id: '10', nome: 'Projeto Alpha', status: 'ativo' }, { id: '11', nome: 'Projeto Beta', status: 'inativo' }], torre: 'Suporte', login: 'joao', login_elevado: null,
    status: 'ativo', nova_expiracao: '2028-02-29', acessos: 'VPN', observacao: null,
    criado_em: '2026-11-12T12:00:00Z', atualizado_em: '2026-11-12T12:00:00Z' },
  { eid: '00002', nome: 'Ana Exemplo', projetos: [], torre: null, login: null, login_elevado: null,
    status: 'pendente', nova_expiracao: null, acessos: null, observacao: '<img src=x onerror=alert(1)>',
    criado_em: '2026-11-12T12:00:00Z', atualizado_em: '2026-11-12T12:00:00Z' },
];

async function fixture(page) {
  await page.route('**/api/funcionarios', (route) => route.fulfill({ json: records }));
  await page.goto('/');
  await expect(page.locator('#employees tr')).toHaveCount(2);
}

test('Pesquisa ignora acentos, encontra EID e combina o filtro de status', async ({ page }) => {
  await fixture(page);
  await page.locator('#search').fill('joao');
  await expect(page.locator('#employees tr')).toHaveCount(1);
  await expect(page.locator('#employees')).toContainText('João da Silva');
  await page.locator('#search').fill('00002');
  await expect(page.locator('#employees tr')).toHaveCount(1);
  await expect(page.locator('#employees')).toContainText('Ana Exemplo');
  await page.locator('#employee-filter-attribute').selectOption('status');
  await page.locator('#employee-filter-value').selectOption('ativo');
  await expect(page.locator('#employees tr')).toHaveCount(0);
  await expect(page.getByRole('status')).toContainText('Nenhum resultado');
  await page.locator('#search').fill('');
  await expect(page.locator('#employees tr')).toHaveCount(1);
});

test('Filtro unico permite escolher o atributo e depois um valor existente', async ({ page }) => {
  await fixture(page);
  await expect(page.locator('#employee-filter-attribute')).toBeVisible();
  await expect(page.locator('#employee-filter-value')).toBeDisabled();

  await page.locator('#employee-filter-attribute').selectOption('torre');
  await page.locator('#employee-filter-value').selectOption('Suporte');
  await expect(page.locator('#employees tr')).toHaveCount(1);
  await expect(page.locator('#employees')).toContainText('João da Silva');

  await page.getByRole('button', { name: 'Limpar filtros' }).click();
  await page.locator('#employee-filter-attribute').selectOption('projetos');
  await page.locator('#employee-filter-value').selectOption('Projeto Beta');
  await expect(page.locator('#employees tr')).toHaveCount(1);
  await expect(page.locator('#employees')).toContainText('João da Silva');

  await page.getByRole('button', { name: 'Limpar filtros' }).click();
  await page.locator('#employee-filter-attribute').selectOption('observacao');
  await page.locator('#employee-filter-value').selectOption('<img src=x onerror=alert(1)>');
  await expect(page.locator('#employees tr')).toHaveCount(1);
  await expect(page.locator('#employees')).toContainText('Ana Exemplo');

  await page.getByRole('button', { name: 'Limpar filtros' }).click();
  await page.locator('#employee-filter-attribute').selectOption('nova_expiracao');
  await page.locator('#employee-filter-value').selectOption('2028-02-29');
  await expect(page.locator('#employees tr')).toHaveCount(1);
  await expect(page.locator('#employees')).toContainText('João da Silva');
});

test('Datas e null sao exibidos corretamente; textos nao viram HTML', async ({ page }) => {
  await fixture(page);
  await expect(page.locator('#employees')).toContainText('29/02/2028');
  await expect(page.locator('#employees')).toContainText('—');
  await expect(page.locator('#employees')).toContainText('<img src=x onerror=alert(1)>');
  await expect(page.locator('#employees img')).toHaveCount(0);
});

test('Indicadores filtram as listas de ativos, a vencer e vencidos', async ({ page }) => {
  const formatDate = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const expiringDate = new Date();
  expiringDate.setDate(expiringDate.getDate() + 5);
  const expiredDate = new Date();
  expiredDate.setDate(expiredDate.getDate() - 1);
  const filteredRecords = [
    { ...records[0], eid: 'ATIVO1', nome: 'Ativo sem prazo', nova_expiracao: null },
    { ...records[0], eid: 'PRAZO1', nome: 'Prazo próximo', nova_expiracao: formatDate(expiringDate) },
    { ...records[0], eid: 'VENCIDO1', nome: 'Prazo vencido', nova_expiracao: formatDate(expiredDate) },
    { ...records[1], eid: 'PENDENTE1', nome: 'Cadastro pendente' },
  ];
  await page.route('**/api/funcionarios', (route) => route.fulfill({ json: filteredRecords }));
  await page.goto('/');

  await page.getByRole('button', { name: 'Mostrar funcionários ativos' }).click();
  await expect(page.locator('#employees tr')).toHaveCount(3);
  await expect(page.locator('[data-employee-filter="active"]')).toHaveAttribute('aria-pressed', 'true');

  await page.getByRole('button', { name: 'Mostrar funcionários a vencer' }).click();
  await expect(page.locator('#employees tr')).toHaveCount(1);
  await expect(page.locator('#employees')).toContainText('Prazo próximo');

  await page.getByRole('button', { name: 'Mostrar funcionários vencidos' }).click();
  await expect(page.locator('#employees tr')).toHaveCount(1);
  await expect(page.locator('#employees')).toContainText('Prazo vencido');

  await page.getByRole('button', { name: 'Mostrar todos os funcionários' }).click();
  await expect(page.locator('#employees tr')).toHaveCount(4);
});

test('Consulta vazia mostra mensagem e contadores zerados', async ({ page }) => {
  await page.route('**/api/funcionarios', (route) => route.fulfill({ json: [] }));
  await page.goto('/');
  await expect(page.getByRole('status')).toHaveText('Nenhum funcionário cadastrado.');
  await expect(page.locator('#total')).toHaveText('0');
  await expect(page.locator('#load-button')).toBeEnabled();
});

test('Carregamento visivel e botao bloqueado enquanto aguarda resposta', async ({ page }) => {
  let release;
  const held = new Promise((resolve) => { release = resolve; });
  await page.route('**/api/funcionarios', async (route) => {
    await held;
    await route.fulfill({ json: records });
  });
  try {
    await page.goto('/');
    await expect(page.getByRole('status')).toHaveText('Carregando funcionários…');
    await expect(page.locator('#load-button')).toBeDisabled();
  } finally { release(); }
  await expect(page.locator('#employees tr')).toHaveCount(2);
  await expect(page.locator('#load-button')).toBeEnabled();
});

test('Falha na consulta mostra erro e permite tentar novamente', async ({ page }) => {
  await page.route('**/api/funcionarios', (route) => route.fulfill({ status: 503, json: { error: { code: 'DATABASE_UNAVAILABLE' } } }));
  await page.goto('/');
  await expect(page.getByRole('status')).toContainText('Não foi possível carregar');
  await expect(page.locator('#load-button')).toBeEnabled();
  await page.unroute('**/api/funcionarios');
  await page.route('**/api/funcionarios', (route) => route.fulfill({ json: records }));
  await page.locator('#load-button').click();
  await expect(page.locator('#employees tr')).toHaveCount(2);
  await expect(page.getByRole('status')).toBeHidden();
});

test('Falha de atualizacao preserva a consulta anterior e avisa sua origem', async ({ page }) => {
  await fixture(page);
  await page.unroute('**/api/funcionarios');
  await page.route('**/api/funcionarios', (route) => route.abort());
  await page.locator('#load-button').click();
  await expect(page.getByRole('status')).toContainText('dados da última consulta');
  await expect(page.locator('#employees tr')).toHaveCount(2);
});

test('Interface em celular sem rolagem horizontal fora da tabela', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await fixture(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expect(page.locator('#load-button')).toBeVisible();
  await page.locator('#search').fill('00001');
  await expect(page.locator('#employees tr')).toHaveCount(1);
  await page.screenshot({ path: 'artifacts/funcionarios-mobile.png', fullPage: true });
});

test('Cadastro de funcionario pelo modal envia a API e atualiza a tabela', async ({ page }) => {
  const data = [...records];
  let received;
  await page.route('**/api/funcionarios', async (route) => {
    if (route.request().method() === 'POST') {
      received = route.request().postDataJSON();
      const created = {
        ...received,
        torre: received.torre ?? null,
        login: received.login ?? null,
        login_elevado: received.login_elevado ?? null,
        nova_expiracao: received.nova_expiracao ?? null,
        acessos: received.acessos ?? null,
        observacao: received.observacao ?? null,
        criado_em: '2026-11-12T12:00:00Z',
        atualizado_em: '2026-11-12T12:00:00Z',
      };
      data.push(created);
      await route.fulfill({ status: 201, json: created });
    } else {
      await route.fulfill({ json: data });
    }
  });
  await page.goto('/');
  await page.getByRole('button', { name: '+ Adicionar Funcionário' }).click();
  const dialog = page.locator('#employee-dialog');
  await dialog.getByLabel('Nome *').fill('Carlos Teste');
  await dialog.getByLabel('EID *').fill('00003');
  await dialog.getByLabel('Status *').selectOption('ativo');
  await dialog.getByRole('button', { name: 'Salvar funcionário' }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.locator('#employees tr')).toHaveCount(3);
  await expect(page.locator('#toast')).toContainText('cadastrado com sucesso');
  expect(received).toMatchObject({ nome: 'Carlos Teste', eid: '00003', status: 'ativo' });
});

test('Abre todos os atributos e exclui funcionario somente pelo modal', async ({ page }) => {
  let employees = records.map((person) => ({ ...person }));
  let deletedEid;
  await page.route('**/api/funcionarios/*', async (route) => {
    if (route.request().method() !== 'DELETE') return route.fallback();
    deletedEid = decodeURIComponent(route.request().url().split('/').pop());
    employees = employees.filter((person) => person.eid !== deletedEid);
    await route.fulfill({ status: 204, body: '' });
  });
  await page.route('**/api/funcionarios', (route) => route.fulfill({ json: employees }));
  await page.route('**/api/funcionarios/*/projetos', (route) => route.fulfill({ json: [
    { id: '10', nome: 'Projeto Alpha', status: 'ativo', vinculado_em: '2026-11-12T12:00:00Z' },
    { id: '11', nome: 'Projeto Beta', status: 'inativo', vinculado_em: '2026-11-13T12:00:00Z' },
  ] }));
  await page.goto('/');
  const row = page.locator('#employees tr').filter({ hasText: 'João da Silva' });
  await expect(row.getByRole('button', { name: 'Excluir funcionário' })).toHaveCount(0);
  await row.getByText('Suporte').click();
  const employeeDialog = page.locator('#employee-dialog');
  await expect(employeeDialog).toBeVisible();
  await expect(employeeDialog.getByRole('heading', { level: 2 })).toHaveText('Dados do funcionário');
  await expect(employeeDialog.getByLabel('Nome *')).toHaveValue('João da Silva');
  await expect(employeeDialog.getByLabel('EID *')).toHaveValue('00001');
  await expect(employeeDialog.getByLabel('Criado em')).toHaveValue(/12\/11\/2026/);
  await expect(employeeDialog.getByLabel('Atualizado em')).toHaveValue(/12\/11\/2026/);
  await expect(employeeDialog.locator('#employee-project-count')).toHaveText('2');
  await expect(employeeDialog.locator('#employee-project-list')).toContainText('Projeto Alpha');
  await expect(employeeDialog.locator('#employee-project-list')).toContainText('Projeto Beta');
  page.once('dialog', (dialog) => dialog.accept());
  await employeeDialog.getByRole('button', { name: 'Excluir funcionário' }).click();
  await expect(employeeDialog).not.toBeVisible();
  await expect(page.locator('#employees tr')).toHaveCount(1);
  await expect(page.locator('#employees')).not.toContainText('João da Silva');
  await expect(page.locator('#toast')).toContainText('Funcionário excluído');
  expect(deletedEid).toBe('00001');
});

test('Cria projeto pela interface e abre sua tabela individual', async ({ page }) => {
  const projects = [];
  await page.route('**/api/funcionarios', (route) => route.fulfill({ json: records }));
  await page.route('**/api/projetos', async (route) => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON();
      const project = { id: '1', ...body, criado_em: '2026-11-12T12:00:00Z', atualizado_em: '2026-11-12T12:00:00Z', total_funcionarios: 0 };
      projects.push(project);
      await route.fulfill({ status: 201, json: project });
    } else {
      await route.fulfill({ json: projects });
    }
  });
  await page.route('**/api/projetos/1/funcionarios', (route) => route.fulfill({ json: [] }));
  await page.goto('/');
  await page.getByRole('link', { name: /Projetos/ }).click();
  await page.getByRole('button', { name: '+ Criar Projeto' }).click();
  const dialog = page.locator('#project-dialog');
  await dialog.getByLabel('Nome do projeto *').fill('Projeto Alpha');
  await dialog.getByLabel('Descrição').fill('Projeto de integração');
  await dialog.getByRole('button', { name: 'Salvar projeto' }).click();
  await expect(page.locator('#projects-list')).toContainText('Projeto Alpha');
  await page.getByRole('button', { name: 'Abrir projeto' }).click();
  await expect(page.locator('#project-title')).toHaveText('Projeto Alpha');
  await expect(page.locator('#project-notice')).toContainText('Nenhum funcionário vinculado');
});

test('Vincula funcionario existente e remove somente o vinculo na interface', async ({ page }) => {
  const project = { id: '7', nome: 'Projeto Beta', descricao: null, status: 'ativo', total_funcionarios: 1 };
  let linked = [records[0]];
  let deleted = false;
  await page.route('**/api/funcionarios', (route) => route.fulfill({ json: records }));
  await page.route('**/api/projetos', (route) => route.fulfill({ json: [{ ...project, total_funcionarios: linked.length }] }));
  await page.route('**/api/projetos/7/funcionarios/*', async (route) => {
    if (route.request().method() === 'DELETE') {
      linked = linked.filter((person) => !route.request().url().endsWith(`/${person.eid}`));
      deleted = true;
      await route.fulfill({ status: 204, body: '' });
    }
  });
  await page.route('**/api/projetos/7/funcionarios', async (route) => {
    if (route.request().method() === 'POST') {
      const ids = route.request().postDataJSON().funcionario_ids;
      linked = [...linked, ...records.filter((person) => ids.includes(person.eid))];
      await route.fulfill({ status: 201, json: { adicionados: ids, ja_vinculados: [] } });
    } else {
      await route.fulfill({ json: linked });
    }
  });
  await page.goto('/');
  await page.getByRole('link', { name: /Projetos/ }).click();
  await page.getByRole('button', { name: 'Abrir projeto' }).click();
  await expect(page.locator('#project-employees tr')).toHaveCount(1);
  await page.getByRole('button', { name: '+ Adicionar Funcionário ao Projeto' }).click();
  await page.locator('#association-list').getByText('Ana Exemplo').click();
  await page.getByRole('button', { name: 'Adicionar selecionados' }).click();
  await expect(page.locator('#project-employees tr')).toHaveCount(2);
  page.once('dialog', (dialog) => dialog.accept());
  await page.locator('#project-employees').getByRole('button', { name: 'Remover do projeto' }).first().click();
  await expect(page.locator('#project-employees tr')).toHaveCount(1);
  expect(deleted).toBe(true);
});

test('Exclui cadastro global pela equipe do projeto', async ({ page }) => {
  const project = { id: '8', nome: 'Projeto Gamma', descricao: null, status: 'ativo', total_funcionarios: 1 };
  let employees = records.map((person) => ({ ...person }));
  let linked = [employees[0]];
  let deletedEid;
  await page.route('**/api/funcionarios/*', async (route) => {
    if (route.request().method() !== 'DELETE') return route.fallback();
    deletedEid = decodeURIComponent(route.request().url().split('/').pop());
    employees = employees.filter((person) => person.eid !== deletedEid);
    linked = linked.filter((person) => person.eid !== deletedEid);
    await route.fulfill({ status: 204, body: '' });
  });
  await page.route('**/api/funcionarios', (route) => route.fulfill({ json: employees }));
  await page.route('**/api/funcionarios/*/projetos', (route) => route.fulfill({ json: [project] }));
  await page.route('**/api/projetos', (route) => route.fulfill({
    json: [{ ...project, total_funcionarios: linked.length }],
  }));
  await page.route('**/api/projetos/8/funcionarios', (route) => route.fulfill({ json: linked }));
  await page.goto('/');
  await page.getByRole('link', { name: /Projetos/ }).click();
  await page.getByRole('button', { name: 'Abrir projeto' }).click();
  const row = page.locator('#project-employees tr').filter({ hasText: 'João da Silva' });
  await row.getByText('João da Silva').click();
  const employeeDialog = page.locator('#employee-dialog');
  await expect(employeeDialog).toBeVisible();
  page.once('dialog', (dialog) => dialog.accept());
  await employeeDialog.getByRole('button', { name: 'Excluir funcionário' }).click();
  await expect(page.locator('#project-employees tr')).toHaveCount(0);
  await expect(page.locator('#project-notice')).toContainText('Nenhum funcionário vinculado');
  await expect(page.locator('#toast')).toContainText('Funcionário excluído');
  expect(deletedEid).toBe('00001');
});
