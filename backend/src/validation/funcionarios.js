const { HttpError } = require('../middleware/errors');

const columns = ['eid', 'nome', 'torre', 'login', 'login_elevado', 'status', 'nova_expiracao', 'acessos', 'observacao'];
const limits = { eid: 20, nome: 150, torre: 100, login: 100, login_elevado: 100, status: 30 };
const statuses = ['ativo', 'inativo', 'pendente', 'bloqueado'];

function validateEid(eid) {
  if (typeof eid !== 'string' || !eid.trim() || [...eid].length > 20 || eid.includes('\0')) {
    throw new HttpError(400, 'INVALID_EID', 'EID deve ser um texto de 1 a 20 caracteres.');
  }
  return eid;
}

function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000')) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function validateBody(body, eid) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new HttpError(400, 'INVALID_BODY', 'Envie um objeto JSON com os campos do funcionario.');
  }
  const fields = Object.create(null);
  const data = {};
  for (const [field, value] of Object.entries(body)) {
    if (!columns.includes(field)) {
      fields[field] = 'Campo desconhecido ou gerenciado pelo banco.';
      continue;
    }
    if (value === null) {
      if (['eid', 'nome', 'status'].includes(field)) fields[field] = 'Este campo nao aceita null.';
      else data[field] = null;
      continue;
    }
    if (typeof value !== 'string' || value.includes('\0')) {
      fields[field] = 'Informe um texto valido ou null nos campos opcionais.';
      continue;
    }
    const text = value.trim();
    if (limits[field] && [...text].length > limits[field]) {
      fields[field] = `Use no maximo ${limits[field]} caracteres.`;
    } else if (['eid', 'nome', 'status'].includes(field) && !text) {
      fields[field] = 'Este campo nao pode ficar vazio.';
    } else if (field === 'status' && !statuses.includes(text)) {
      fields[field] = `Valores permitidos: ${statuses.join(', ')}.`;
    } else if (field === 'nova_expiracao' && text && !validDate(text)) {
      fields[field] = 'Informe uma data existente no formato YYYY-MM-DD.';
    } else {
      data[field] = text || null;
    }
  }
  if (eid === undefined) {
    for (const field of ['eid', 'nome']) {
      if (!Object.hasOwn(body, field)) fields[field] = 'Campo obrigatorio.';
    }
  } else {
    if (Object.hasOwn(body, 'eid') && data.eid !== eid) {
      fields.eid = 'O EID identifica o cadastro e nao pode ser alterado.';
    }
    delete data.eid;
    if (!Object.keys(data).length && !Object.keys(fields).length) {
      fields.body = 'Envie ao menos um campo para atualizar.';
    }
  }
  if (Object.keys(fields).length) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'Confira os campos enviados.', fields);
  }
  return data;
}

module.exports = { validateEid, validateBody };
