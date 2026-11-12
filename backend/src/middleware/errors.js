class HttpError extends Error {
  constructor(status, code, message, fields) {
    super(message);
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);
  let status = 500;
  let code = 'INTERNAL_ERROR';
  let message = 'Nao foi possivel concluir a operacao.';
  let fields;
  if (error instanceof HttpError) {
    ({ status, code, message, fields } = error);
  } else if (error.type === 'entity.parse.failed' || error instanceof URIError) {
    [status, code, message] = [400, 'INVALID_REQUEST', 'JSON ou endereco da requisicao invalido.'];
  } else if (error.type === 'entity.too.large') {
    [status, code, message] = [413, 'BODY_TOO_LARGE', 'O corpo da requisicao excede 64 KB.'];
  } else if (error.code === '23505') {
    if (error.constraint === 'projetos_nome_normalizado_uq') {
      [status, code, message] = [409, 'PROJECT_NAME_CONFLICT', 'Ja existe um projeto com esse nome.'];
    } else if (error.constraint === 'funcionario_projeto_pkey') {
      [status, code, message] = [409, 'LINK_CONFLICT', 'O funcionario ja esta vinculado a esse projeto.'];
    } else {
      [status, code, message] = [409, 'CONFLICT', 'Ja existe um funcionario com esse EID.'];
    }
  } else if (error.code === '23503') {
    [status, code, message] = [409, 'REFERENCE_CONFLICT',
      error.constraint === 'funcionario_projeto_funcionario_id_fkey'
        ? 'O funcionario possui vinculos com projetos. Remova os vinculos antes de excluir o cadastro.'
        : 'O registro esta relacionado a outros dados e nao pode ser alterado dessa forma.'];
  } else if (['23502', '23514', '22001', '22007', '22008'].includes(error.code)) {
    [status, code, message] = [400, 'INVALID_DATA', 'Os dados nao atendem as regras do cadastro.'];
  } else if (['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', '28P01', '53300', '57P01', '57014'].includes(error.code)
    || String(error.code ?? '').startsWith('08')) {
    [status, code, message] = [503, 'DATABASE_UNAVAILABLE', 'Banco de dados indisponivel. Tente novamente em instantes.'];
  }
  if (status >= 500) {
    console.error('Falha na API.', { codigo: error.code ?? 'INTERNAL_ERROR', metodo: req.method });
  }
  res.status(status).json({ error: { code, message, ...(fields ? { fields } : {}) } });
}

module.exports = { HttpError, errorHandler };
