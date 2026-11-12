const { HttpError } = require('../middleware/errors');
const { validateEid } = require('../validation/funcionarios');
const { validateProjectId, validateProjectBody, validateEmployeeIds } = require('../validation/projetos');

function requireProject(rows) {
  if (!rows.length) throw new HttpError(404, 'PROJECT_NOT_FOUND', 'Projeto nao encontrado.');
  return rows[0];
}

function createController(db) {
  async function ensureProject(id) {
    const { rows } = await db.query('SELECT id FROM public.projetos WHERE id = $1', [id]);
    requireProject(rows);
  }

  return {
    async list(req, res) {
      const { rows } = await db.query(`
        SELECT p.*, count(fp.funcionario_id)::int AS total_funcionarios
        FROM public.projetos p
        LEFT JOIN public.funcionario_projeto fp ON fp.projeto_id = p.id
        GROUP BY p.id
        ORDER BY lower(p.nome), p.id
      `);
      res.json(rows);
    },
    async get(req, res) {
      const id = validateProjectId(req.params.id);
      const { rows } = await db.query(`
        SELECT p.*, count(fp.funcionario_id)::int AS total_funcionarios
        FROM public.projetos p
        LEFT JOIN public.funcionario_projeto fp ON fp.projeto_id = p.id
        WHERE p.id = $1
        GROUP BY p.id
      `, [id]);
      res.json(requireProject(rows));
    },
    async create(req, res) {
      const data = validateProjectBody(req.body);
      const fields = Object.keys(data);
      const placeholders = fields.map((_, index) => `$${index + 1}`);
      const { rows } = await db.query(
        `INSERT INTO public.projetos (${fields.map((field) => `"${field}"`).join(', ')})
         VALUES (${placeholders.join(', ')}) RETURNING *`, Object.values(data),
      );
      res.location(`/api/projetos/${rows[0].id}`).status(201).json({ ...rows[0], total_funcionarios: 0 });
    },
    async update(req, res) {
      const id = validateProjectId(req.params.id);
      const data = validateProjectBody(req.body, true);
      const assignments = Object.keys(data).map((field, index) => `"${field}" = $${index + 1}`);
      const { rows } = await db.query(
        `UPDATE public.projetos SET ${assignments.join(', ')}
         WHERE id = $${assignments.length + 1} RETURNING *`, [...Object.values(data), id],
      );
      res.json(requireProject(rows));
    },
    async remove(req, res) {
      const id = validateProjectId(req.params.id);
      const { rows } = await db.query('DELETE FROM public.projetos WHERE id = $1 RETURNING id', [id]);
      requireProject(rows);
      res.status(204).end();
    },
    async listEmployees(req, res) {
      const id = validateProjectId(req.params.id);
      await ensureProject(id);
      const { rows } = await db.query(`
        SELECT f.*, fp.vinculado_em
        FROM public.funcionario_projeto fp
        JOIN public.funcionarios f ON f.eid = fp.funcionario_id
        WHERE fp.projeto_id = $1
        ORDER BY lower(f.nome), f.eid
      `, [id]);
      res.json(rows);
    },
    async addEmployees(req, res) {
      const id = validateProjectId(req.params.id);
      const employeeIds = validateEmployeeIds(req.body);
      await ensureProject(id);
      const existing = await db.query(
        'SELECT eid FROM public.funcionarios WHERE eid = ANY($1::varchar[])', [employeeIds],
      );
      const found = new Set(existing.rows.map((row) => row.eid));
      const missing = employeeIds.filter((eid) => !found.has(eid));
      if (missing.length) {
        throw new HttpError(400, 'EMPLOYEE_NOT_FOUND', 'Um ou mais funcionarios nao existem.', {
          funcionario_ids: `EIDs nao encontrados: ${missing.join(', ')}.`,
        });
      }
      const { rows } = await db.query(`
        INSERT INTO public.funcionario_projeto (funcionario_id, projeto_id)
        SELECT eid, $1 FROM unnest($2::varchar[]) AS eid
        ON CONFLICT (funcionario_id, projeto_id) DO NOTHING
        RETURNING funcionario_id
      `, [id, employeeIds]);
      res.status(201).json({
        adicionados: rows.map((row) => row.funcionario_id),
        ja_vinculados: employeeIds.filter((eid) => !rows.some((row) => row.funcionario_id === eid)),
      });
    },
    async removeEmployee(req, res) {
      const id = validateProjectId(req.params.id);
      const eid = validateEid(req.params.funcionarioId);
      const { rows } = await db.query(
        `DELETE FROM public.funcionario_projeto
         WHERE projeto_id = $1 AND funcionario_id = $2 RETURNING funcionario_id`, [id, eid],
      );
      if (!rows.length) throw new HttpError(404, 'LINK_NOT_FOUND', 'Vinculo nao encontrado.');
      res.status(204).end();
    },
    async listEmployeeProjects(req, res) {
      const eid = validateEid(req.params.eid);
      const employee = await db.query('SELECT eid FROM public.funcionarios WHERE eid = $1', [eid]);
      if (!employee.rows.length) throw new HttpError(404, 'NOT_FOUND', 'Funcionario nao encontrado.');
      const { rows } = await db.query(`
        SELECT p.*, fp.vinculado_em
        FROM public.funcionario_projeto fp
        JOIN public.projetos p ON p.id = fp.projeto_id
        WHERE fp.funcionario_id = $1
        ORDER BY lower(p.nome), p.id
      `, [eid]);
      res.json(rows);
    },
  };
}

module.exports = { createController };
