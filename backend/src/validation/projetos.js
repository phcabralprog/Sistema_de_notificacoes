const { HttpError } = require('../middleware/errors');

const columns = ['nome', 'descricao', 'status'];
const statuses = ['ativo', 'inativo'];

function validateProjectId(value) {
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) {
    throw new HttpError(400, 'INVALID_PROJECT_ID', 'O identificador do projeto deve ser um inteiro positivo.');
  }
  return value;
}

function validateProjectBody(body, updating = false) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new HttpError(400, 'INVALID_BODY', 'Envie um objeto JSON com os campos do projeto.');
  }
  const fields = Object.create(null);
  const data = {};
  for (const [field, value] of Object.entries(body)) {
    if (!columns.includes(field)) {
      fields[field] = 'Campo desconhecido ou gerenciado pelo banco.';
      continue;
    }
    if (value === null) {
      if (field === 'descricao') data.descricao = null;
      else fields[field] = 'Este campo nao aceita null.';
      continue;
    }
    if (typeof value !== 'string' || value.includes('\0')) {
      fields[field] = 'Informe um texto valido.';
      continue;
    }
    const text = value.trim();
    if (field === 'nome' && (!text || [...text].length > 150)) {
      fields.nome = text ? 'Use no maximo 150 caracteres.' : 'Este campo nao pode ficar vazio.';
    } else if (field === 'status' && !statuses.includes(text)) {
      fields.status = `Valores permitidos: ${statuses.join(', ')}.`;
    } else {
      data[field] = text || null;
    }
  }
  if (!updating && !Object.hasOwn(body, 'nome')) fields.nome = 'Campo obrigatorio.';
  if (updating && !Object.keys(data).length && !Object.keys(fields).length) {
    fields.body = 'Envie ao menos um campo para atualizar.';
  }
  if (Object.keys(fields).length) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'Confira os campos enviados.', fields);
  }
  return data;
}

function validateEmployeeIds(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new HttpError(400, 'INVALID_BODY', 'Envie um objeto JSON com funcionario_ids.');
  }
  const unknown = Object.keys(body).filter((key) => key !== 'funcionario_ids');
  if (unknown.length) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'Confira os campos enviados.', {
      [unknown[0]]: 'Campo desconhecido.',
    });
  }
  if (!Array.isArray(body.funcionario_ids) || !body.funcionario_ids.length) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'Confira os campos enviados.', {
      funcionario_ids: 'Selecione ao menos um funcionario.',
    });
  }
  const invalid = body.funcionario_ids.some((eid) => (
    typeof eid !== 'string' || !eid.trim() || [...eid].length > 20 || eid.includes('\0')
  ));
  if (invalid) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'Confira os campos enviados.', {
      funcionario_ids: 'Todos os EIDs devem ser textos de 1 a 20 caracteres.',
    });
  }
  return [...new Set(body.funcionario_ids)];
}

module.exports = { validateProjectId, validateProjectBody, validateEmployeeIds };
