const ui = {
  button: document.querySelector('#load-button'),
  search: document.querySelector('#search'),
  status: document.querySelector('#status'),
  body: document.querySelector('#employees'),
  notice: document.querySelector('#notice'),
  directory: document.querySelector('#employees-view .directory'),
  projectsDirectory: document.querySelector('#projects-view .directory'),
  projectDirectory: document.querySelector('#project-detail-view .directory'),
};

const state = {
  employees: [],
  projects: [],
  projectEmployees: [],
  currentProject: null,
  employeesLoaded: false,
  projectsLoaded: false,
  employeeLoadFailed: false,
  editingEmployee: null,
  editingProject: null,
};

const statusLabels = { ativo: 'Ativo', pendente: 'Pendente', bloqueado: 'Bloqueado', inativo: 'Inativo' };
const dateTime = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

function normalize(value) {
  return String(value ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('pt-BR');
}

function today() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function expirationIn30Days() {
  const date = new Date(`${today()}T12:00:00`);
  date.setDate(date.getDate() + 30);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

async function request(url, options = {}) {
  const config = {
    ...options,
    headers: { Accept: 'application/json', ...(options.headers || {}) },
    signal: options.signal || AbortSignal.timeout(15000),
  };
  if (config.body && typeof config.body !== 'string') {
    config.headers['Content-Type'] = 'application/json';
    config.body = JSON.stringify(config.body);
  }
  const response = await fetch(url, config);
  if (response.status === 204) return null;
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(data?.error?.message || 'Não foi possível concluir a operação.');
    error.fields = data?.error?.fields;
    error.status = response.status;
    throw error;
  }
  return data;
}

function setNotice(element, message, error = false) {
  element.textContent = message;
  element.hidden = !message;
  element.classList.toggle('error', error);
}

let toastTimer;
function toast(message, error = false) {
  const element = document.querySelector('#toast');
  clearTimeout(toastTimer);
  element.textContent = message;
  element.classList.toggle('error', error);
  element.hidden = false;
  toastTimer = setTimeout(() => { element.hidden = true; }, 4500);
}

function cell(row, value, className) {
  const td = document.createElement('td');
  td.textContent = value === null || value === undefined || value === '' ? '—' : String(value);
  if (className) td.className = className;
  if (value === null || value === undefined || value === '') td.classList.add('muted');
  row.append(td);
  return td;
}

function avatarFor(person, index) {
  const wrapper = document.createElement('span');
  wrapper.className = 'person';
  const avatar = document.createElement('span');
  avatar.className = `avatar avatar-${index % 4}`;
  avatar.setAttribute('aria-hidden', 'true');
  avatar.textContent = person.nome.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
  const name = document.createElement('strong');
  name.textContent = person.nome;
  wrapper.append(avatar, name);
  return wrapper;
}

function identityCell(row, person, index, editable = false) {
  const td = cell(row, '');
  if (editable) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'person-button';
    button.title = `Editar ${person.nome}`;
    button.append(avatarFor(person, index));
    button.addEventListener('click', () => openEmployeeDialog(person));
    td.replaceChildren(button);
  } else {
    td.replaceChildren(avatarFor(person, index));
  }
}

function eidCell(row, value) {
  const td = cell(row, '');
  const eid = document.createElement('span');
  eid.className = 'eid';
  eid.textContent = value;
  td.replaceChildren(eid);
}

function statusCell(row, value) {
  const td = cell(row, '');
  const badge = document.createElement('span');
  badge.className = `status-pill ${Object.hasOwn(statusLabels, value) ? `status-${value}` : ''}`;
  badge.textContent = statusLabels[value] ?? value;
  td.replaceChildren(badge);
}

function expirationCell(row, person) {
  const td = cell(row, person.nova_expiracao ? person.nova_expiracao.split('-').reverse().join('/') : null);
  if (person.status === 'ativo' && person.nova_expiracao && person.nova_expiracao < today()) {
    const hint = document.createElement('span');
    hint.className = 'date-note';
    hint.textContent = 'Prazo vencido';
    td.append(hint);
  }
}

function employeeBaseCells(row, person, index, editable = false) {
  identityCell(row, person, index, editable);
  eidCell(row, person.eid);
  cell(row, person.torre);
  cell(row, person.login);
  cell(row, person.login_elevado);
  statusCell(row, person.status);
  expirationCell(row, person);
  cell(row, person.acessos, 'text-cell');
  cell(row, person.observacao, 'text-cell');
}

function statsFor(employees) {
  const active = employees.filter((person) => person.status === 'ativo');
  return {
    total: employees.length,
    active: active.length,
    expiring: active.filter((person) => person.nova_expiracao && person.nova_expiracao >= today() && person.nova_expiracao <= expirationIn30Days()).length,
    expired: active.filter((person) => person.nova_expiracao && person.nova_expiracao < today()).length,
  };
}

function updateEmployeeStats() {
  const values = statsFor(state.employees);
  values['nav-count'] = state.employees.length;
  for (const [id, value] of Object.entries(values)) document.getElementById(id).textContent = value;
}

function renderEmployees() {
  const term = normalize(ui.search.value.trim());
  const visible = state.employees.filter((person) =>
    (!ui.status.value || person.status === ui.status.value)
    && (normalize(person.nome).includes(term) || normalize(person.eid).includes(term)),
  ).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  const fragment = document.createDocumentFragment();
  visible.forEach((person, index) => {
    const row = document.createElement('tr');
    employeeBaseCells(row, person, index, true);
    cell(row, person.criado_em ? dateTime.format(new Date(person.criado_em)) : null);
    cell(row, person.atualizado_em ? dateTime.format(new Date(person.atualizado_em)) : null);
    const actions = cell(row, '');
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'link-danger';
    remove.textContent = 'Excluir funcionário';
    remove.addEventListener('click', () => deleteEmployee(person, remove));
    actions.replaceChildren(remove);
    fragment.append(row);
  });
  ui.body.replaceChildren(fragment);
  document.querySelector('#result-count').textContent = visible.length;
  document.querySelector('#table-summary').textContent = `Exibindo ${visible.length} de ${state.employees.length} funcionários`;
  if (state.employeeLoadFailed) return;
  if (!state.employees.length && state.employeesLoaded) setNotice(ui.notice, 'Nenhum funcionário cadastrado.');
  else if (!visible.length && state.employeesLoaded) setNotice(ui.notice, 'Nenhum resultado para esta pesquisa. Ajuste o nome, EID ou status.');
  else setNotice(ui.notice, '');
}

async function loadEmployees() {
  ui.button.disabled = true;
  ui.directory.setAttribute('aria-busy', 'true');
  state.employeeLoadFailed = false;
  setNotice(ui.notice, 'Carregando funcionários…');
  try {
    const data = await request('/api/funcionarios');
    if (!Array.isArray(data)) throw new Error('A consulta retornou um formato inesperado.');
    state.employees = data;
    state.employeesLoaded = true;
    updateEmployeeStats();
    renderEmployees();
    document.querySelector('#updated-at').textContent = `Atualizado às ${new Intl.DateTimeFormat('pt-BR', { timeStyle: 'short' }).format(new Date())}`;
  } catch (error) {
    state.employeeLoadFailed = true;
    const message = error.name === 'TimeoutError'
      ? 'A consulta demorou mais que o esperado. Clique em Listar Funcionários para tentar novamente.'
      : 'Não foi possível carregar os funcionários. Verifique se o servidor está ativo e tente novamente.';
    setNotice(ui.notice, state.employeesLoaded ? `${message} A tabela mantém os dados da última consulta.` : message, true);
    document.querySelector('#updated-at').textContent = state.employeesLoaded ? 'Falha ao atualizar · dados da última consulta' : 'Consulta indisponível';
  } finally {
    ui.button.disabled = false;
    ui.directory.setAttribute('aria-busy', 'false');
  }
}

function formValues(form) {
  return Object.fromEntries([...new FormData(form)].map(([key, value]) => [key, value === '' ? null : value]));
}

function openEmployeeDialog(person = null) {
  state.editingEmployee = person;
  const form = document.querySelector('#employee-form');
  form.reset();
  document.querySelector('#employee-form-message').textContent = '';
  document.querySelector('#employee-form-title').textContent = person ? 'Editar funcionário' : 'Adicionar funcionário';
  form.elements.eid.disabled = Boolean(person);
  if (person) {
    for (const name of ['nome', 'eid', 'torre', 'login', 'login_elevado', 'status', 'nova_expiracao', 'acessos', 'observacao']) {
      form.elements[name].value = person[name] ?? '';
    }
  }
  document.querySelector('#employee-dialog').showModal();
}

async function saveEmployee(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const submit = form.querySelector('[type="submit"]');
  const message = document.querySelector('#employee-form-message');
  submit.disabled = true;
  message.textContent = '';
  try {
    const editing = state.editingEmployee;
    await request(editing ? `/api/funcionarios/${encodeURIComponent(editing.eid)}` : '/api/funcionarios', {
      method: editing ? 'PUT' : 'POST', body: formValues(form),
    });
    document.querySelector('#employee-dialog').close();
    await loadEmployees();
    if (state.currentProject) await loadProjectEmployees();
    toast(editing ? 'Funcionário atualizado com sucesso.' : 'Funcionário cadastrado com sucesso.');
  } catch (error) {
    message.textContent = error.fields ? Object.values(error.fields).join(' ') : error.message;
  } finally {
    submit.disabled = false;
  }
}

function renderProjects() {
  const list = document.querySelector('#projects-list');
  const fragment = document.createDocumentFragment();
  state.projects.forEach((project) => {
    const card = document.createElement('article');
    card.className = 'project-card';
    const header = document.createElement('div');
    const badge = document.createElement('span');
    badge.className = `status-pill status-${project.status}`;
    badge.textContent = statusLabels[project.status] || project.status;
    const title = document.createElement('h3');
    title.textContent = project.nome;
    const description = document.createElement('p');
    description.textContent = project.descricao || 'Sem descrição.';
    header.append(badge, title, description);
    const total = document.createElement('strong');
    total.className = 'project-total';
    total.textContent = `${project.total_funcionarios ?? 0} funcionário${Number(project.total_funcionarios) === 1 ? '' : 's'}`;
    const actions = document.createElement('div');
    actions.className = 'card-actions';
    const open = document.createElement('button');
    open.type = 'button'; open.className = 'primary-button'; open.textContent = 'Abrir projeto';
    open.addEventListener('click', () => openProject(project.id));
    const edit = document.createElement('button');
    edit.type = 'button'; edit.className = 'text-button'; edit.textContent = 'Editar';
    edit.addEventListener('click', () => openProjectDialog(project));
    const remove = document.createElement('button');
    remove.type = 'button'; remove.className = 'text-button danger'; remove.textContent = 'Excluir';
    remove.addEventListener('click', () => deleteProject(project));
    actions.append(open, edit, remove);
    card.append(header, total, actions);
    fragment.append(card);
  });
  list.replaceChildren(fragment);
  document.querySelector('#projects-count').textContent = state.projects.length;
  document.querySelector('#project-nav-count').textContent = state.projects.length;
  setNotice(document.querySelector('#projects-notice'), state.projects.length ? '' : 'Nenhum projeto cadastrado. Crie o primeiro projeto para começar.');
}

async function loadProjects() {
  ui.projectsDirectory.setAttribute('aria-busy', 'true');
  setNotice(document.querySelector('#projects-notice'), 'Carregando projetos…');
  try {
    const data = await request('/api/projetos');
    if (!Array.isArray(data)) throw new Error('Formato inesperado.');
    state.projects = data;
    state.projectsLoaded = true;
    renderProjects();
  } catch (error) {
    setNotice(document.querySelector('#projects-notice'), error.message, true);
  } finally {
    ui.projectsDirectory.setAttribute('aria-busy', 'false');
  }
}

function openProjectDialog(project = null) {
  state.editingProject = project;
  const form = document.querySelector('#project-form');
  form.reset();
  document.querySelector('#project-form-message').textContent = '';
  document.querySelector('#project-form-title').textContent = project ? 'Editar projeto' : 'Criar projeto';
  if (project) {
    form.elements.nome.value = project.nome;
    form.elements.descricao.value = project.descricao ?? '';
    form.elements.status.value = project.status;
  }
  document.querySelector('#project-dialog').showModal();
}

async function saveProject(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const submit = form.querySelector('[type="submit"]');
  const message = document.querySelector('#project-form-message');
  submit.disabled = true;
  message.textContent = '';
  try {
    const editing = state.editingProject;
    const saved = await request(editing ? `/api/projetos/${editing.id}` : '/api/projetos', {
      method: editing ? 'PUT' : 'POST', body: formValues(form),
    });
    document.querySelector('#project-dialog').close();
    await loadProjects();
    if (state.currentProject && String(state.currentProject.id) === String(saved.id)) {
      state.currentProject = { ...state.currentProject, ...saved };
      updateProjectHeader();
    }
    toast(editing ? 'Projeto atualizado com sucesso.' : 'Projeto criado com sucesso.');
  } catch (error) {
    message.textContent = error.fields ? Object.values(error.fields).join(' ') : error.message;
  } finally {
    submit.disabled = false;
  }
}

async function deleteProject(project) {
  if (!window.confirm(`Excluir o projeto “${project.nome}”? Os vínculos serão removidos, mas os funcionários serão preservados.`)) return;
  try {
    await request(`/api/projetos/${project.id}`, { method: 'DELETE' });
    await loadProjects();
    toast('Projeto excluído. Os funcionários foram preservados.');
  } catch (error) {
    toast(error.message, true);
  }
}

function updateProjectHeader() {
  const project = state.currentProject;
  document.querySelector('#project-title').textContent = project.nome;
  document.querySelector('#project-description').textContent = project.descricao || 'Funcionários vinculados ao projeto.';
  document.querySelector('#project-table-heading').firstChild.textContent = `${project.nome} `;
  document.querySelector('#project-status-badge').textContent = statusLabels[project.status] || project.status;
  document.querySelector('#project-status-badge').className = `project-status-badge status-${project.status}`;
  document.querySelector('#breadcrumb').textContent = project.nome;
}

function updateProjectStats() {
  const values = statsFor(state.projectEmployees);
  for (const key of ['total', 'active', 'expiring', 'expired']) {
    document.querySelector(`#project-${key}`).textContent = values[key];
  }
}

function renderProjectEmployees() {
  const term = normalize(document.querySelector('#project-search').value.trim());
  const statusFilter = document.querySelector('#project-status-filter').value;
  const visible = state.projectEmployees.filter((person) =>
    (!statusFilter || person.status === statusFilter)
    && (normalize(person.nome).includes(term) || normalize(person.eid).includes(term)),
  );
  const fragment = document.createDocumentFragment();
  visible.forEach((person, index) => {
    const row = document.createElement('tr');
    employeeBaseCells(row, person, index);
    const actions = cell(row, '');
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'link-action';
    remove.textContent = 'Remover do projeto';
    remove.addEventListener('click', () => removeFromProject(person));
    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = 'link-danger';
    deleteButton.textContent = 'Excluir funcionário';
    deleteButton.addEventListener('click', () => deleteEmployee(person, deleteButton));
    const actionGroup = document.createElement('div');
    actionGroup.className = 'row-actions';
    actionGroup.append(remove, deleteButton);
    actions.replaceChildren(actionGroup);
    fragment.append(row);
  });
  document.querySelector('#project-employees').replaceChildren(fragment);
  document.querySelector('#project-result-count').textContent = visible.length;
  document.querySelector('#project-table-summary').textContent = `Exibindo ${visible.length} de ${state.projectEmployees.length} funcionários vinculados`;
  const message = !state.projectEmployees.length
    ? 'Nenhum funcionário vinculado a este projeto.'
    : (!visible.length ? 'Nenhum resultado para os filtros informados.' : '');
  setNotice(document.querySelector('#project-notice'), message);
}

async function loadProjectEmployees() {
  if (!state.currentProject) return;
  ui.projectDirectory.setAttribute('aria-busy', 'true');
  setNotice(document.querySelector('#project-notice'), 'Carregando equipe…');
  try {
    const data = await request(`/api/projetos/${state.currentProject.id}/funcionarios`);
    state.projectEmployees = data;
    updateProjectStats();
    renderProjectEmployees();
  } catch (error) {
    setNotice(document.querySelector('#project-notice'), error.message, true);
  } finally {
    ui.projectDirectory.setAttribute('aria-busy', 'false');
  }
}

async function openProject(id) {
  try {
    const project = state.projects.find((item) => String(item.id) === String(id)) || await request(`/api/projetos/${id}`);
    state.currentProject = project;
    window.location.hash = `projeto/${project.id}`;
    showView('project-detail');
    updateProjectHeader();
    await loadProjectEmployees();
  } catch (error) {
    toast(error.message, true);
    showView('projetos');
  }
}

async function removeFromProject(person) {
  if (!window.confirm(`Remover ${person.nome} deste projeto? O cadastro global será preservado.`)) return;
  try {
    await request(`/api/projetos/${state.currentProject.id}/funcionarios/${encodeURIComponent(person.eid)}`, { method: 'DELETE' });
    await Promise.all([loadProjectEmployees(), loadProjects()]);
    toast('Vínculo removido. O cadastro do funcionário foi preservado.');
  } catch (error) {
    toast(error.message, true);
  }
}

async function deleteEmployee(person, trigger) {
  const confirmed = window.confirm(
    `Excluir ${person.nome} permanentemente? O cadastro e todos os vínculos com projetos serão removidos. Esta ação não pode ser desfeita.`,
  );
  if (!confirmed) return;
  trigger.disabled = true;
  try {
    await request(`/api/funcionarios/${encodeURIComponent(person.eid)}`, { method: 'DELETE' });
    const refreshes = [loadEmployees()];
    if (state.projectsLoaded) refreshes.push(loadProjects());
    if (state.currentProject) refreshes.push(loadProjectEmployees());
    await Promise.all(refreshes);
    toast('Funcionário excluído. Seus vínculos com projetos também foram removidos.');
  } catch (error) {
    toast(error.message, true);
  } finally {
    trigger.disabled = false;
  }
}

function renderAssociationChoices() {
  const term = normalize(document.querySelector('#association-search').value.trim());
  const linked = new Set(state.projectEmployees.map((person) => person.eid));
  const available = state.employees.filter((person) => !linked.has(person.eid)
    && (normalize(person.nome).includes(term) || normalize(person.eid).includes(term)));
  const fragment = document.createDocumentFragment();
  available.forEach((person) => {
    const label = document.createElement('label');
    label.className = 'selection-item';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox'; checkbox.name = 'funcionario_ids'; checkbox.value = person.eid;
    const text = document.createElement('span');
    const name = document.createElement('strong'); name.textContent = person.nome;
    const eid = document.createElement('small'); eid.textContent = `${person.eid} · ${statusLabels[person.status] || person.status}`;
    text.append(name, eid); label.append(checkbox, text); fragment.append(label);
  });
  if (!available.length) {
    const empty = document.createElement('p'); empty.className = 'empty-selection';
    empty.textContent = term ? 'Nenhum funcionário disponível para esta pesquisa.' : 'Todos os funcionários já estão vinculados.';
    fragment.append(empty);
  }
  document.querySelector('#association-list').replaceChildren(fragment);
}

async function openAssociationDialog() {
  if (!state.employeesLoaded) await loadEmployees();
  document.querySelector('#association-search').value = '';
  document.querySelector('#association-form-message').textContent = '';
  renderAssociationChoices();
  document.querySelector('#association-dialog').showModal();
}

async function saveAssociations(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const submit = form.querySelector('[type="submit"]');
  const selected = [...form.querySelectorAll('input[name="funcionario_ids"]:checked')].map((input) => input.value);
  const message = document.querySelector('#association-form-message');
  if (!selected.length) { message.textContent = 'Selecione ao menos um funcionário.'; return; }
  submit.disabled = true;
  message.textContent = '';
  try {
    await request(`/api/projetos/${state.currentProject.id}/funcionarios`, {
      method: 'POST', body: { funcionario_ids: selected },
    });
    document.querySelector('#association-dialog').close();
    await Promise.all([loadProjectEmployees(), loadProjects()]);
    toast(`${selected.length} vínculo${selected.length === 1 ? '' : 's'} adicionado${selected.length === 1 ? '' : 's'} com sucesso.`);
  } catch (error) {
    message.textContent = error.fields ? Object.values(error.fields).join(' ') : error.message;
  } finally {
    submit.disabled = false;
  }
}

function showView(view) {
  const ids = { funcionarios: 'employees-view', projetos: 'projects-view', 'project-detail': 'project-detail-view' };
  document.querySelectorAll('.view').forEach((element) => { element.hidden = element.id !== ids[view]; });
  document.querySelectorAll('[data-view-link]').forEach((link) => {
    const active = link.dataset.viewLink === (view === 'project-detail' ? 'projetos' : view);
    link.classList.toggle('active', active);
    if (active) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
  });
  if (view === 'funcionarios') document.querySelector('#breadcrumb').textContent = 'Dashboard';
  if (view === 'projetos') document.querySelector('#breadcrumb').textContent = 'Projetos';
}

async function navigateFromHash() {
  const hash = window.location.hash.replace(/^#/, '');
  if (hash.startsWith('projeto/')) {
    const id = hash.split('/')[1];
    if (id && (!state.currentProject || String(state.currentProject.id) !== id)) await openProject(id);
    return;
  }
  if (hash === 'projetos') {
    showView('projetos');
    if (!state.projectsLoaded) await loadProjects();
  } else {
    showView('funcionarios');
  }
}

ui.button.addEventListener('click', loadEmployees);
ui.search.addEventListener('input', renderEmployees);
ui.status.addEventListener('change', renderEmployees);
document.querySelector('#add-employee-button').addEventListener('click', () => openEmployeeDialog());
document.querySelector('#employee-form').addEventListener('submit', saveEmployee);
document.querySelector('#create-project-button').addEventListener('click', () => openProjectDialog());
document.querySelector('#project-form').addEventListener('submit', saveProject);
document.querySelector('#reload-projects').addEventListener('click', loadProjects);
document.querySelector('#back-to-projects').addEventListener('click', () => { window.location.hash = 'projetos'; });
document.querySelector('#edit-project-button').addEventListener('click', () => openProjectDialog(state.currentProject));
document.querySelector('#add-to-project-button').addEventListener('click', openAssociationDialog);
document.querySelector('#association-form').addEventListener('submit', saveAssociations);
document.querySelector('#association-search').addEventListener('input', renderAssociationChoices);
document.querySelector('#project-search').addEventListener('input', renderProjectEmployees);
document.querySelector('#project-status-filter').addEventListener('change', renderProjectEmployees);
document.querySelectorAll('[data-close-dialog]').forEach((button) => button.addEventListener('click', () => button.closest('dialog').close()));
window.addEventListener('hashchange', navigateFromHash);

loadEmployees();
navigateFromHash();
