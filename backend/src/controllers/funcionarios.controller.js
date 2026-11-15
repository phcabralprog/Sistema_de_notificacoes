const { HttpError } = require('../middleware/errors');
const { validateEid, validateBody } = require('../validation/funcionarios');

function requireRecord(rows) {
  if (!rows.length) throw new HttpError(404, 'NOT_FOUND', 'Funcionario nao encontrado.');
  return rows[0];
}

function createController(db) {
  return {
    async list(req, res) {
      const { rows } = await db.query('SELECT * FROM public.funcionarios ORDER BY eid');
      res.json(rows);
    },
    async get(req, res) {
      const eid = validateEid(req.params.eid);
      const { rows } = await db.query('SELECT * FROM public.funcionarios WHERE eid = $1', [eid]);
      res.json(requireRecord(rows));
    },
    async create(req, res) {
      const data = validateBody(req.body);
      const fields = Object.keys(data); // Nomes restritos pela lista da validacao.
      const placeholders = fields.map((_, index) => `$${index + 1}`);
      const { rows } = await db.query(
        `INSERT INTO public.funcionarios (${fields.map((f) => `"${f}"`).join(', ')})
         VALUES (${placeholders.join(', ')}) RETURNING *`, Object.values(data),
      );
      res.location(`/api/funcionarios/${encodeURIComponent(rows[0].eid)}`).status(201).json(rows[0]);
    },
    async update(req, res) {
      const eid = validateEid(req.params.eid);
      const data = validateBody(req.body, eid);
      const assignments = Object.keys(data).map((field, index) => `"${field}" = $${index + 1}`);
      const { rows } = await db.query(
        `UPDATE public.funcionarios SET ${assignments.join(', ')}
         WHERE eid = $${assignments.length + 1} RETURNING *`, [...Object.values(data), eid],
      );
      res.json(requireRecord(rows));
    },
    async remove(req, res) {
      const eid = validateEid(req.params.eid);
      const connection = typeof db.connect === 'function' ? await db.connect() : db;
      const ownsConnection = connection !== db;
      try {
        if (ownsConnection) await connection.query('BEGIN');
        await connection.query('DELETE FROM public.funcionario_projeto WHERE funcionario_id = $1', [eid]);
        const { rows } = await connection.query('DELETE FROM public.funcionarios WHERE eid = $1 RETURNING eid', [eid]);
        requireRecord(rows);
        if (ownsConnection) await connection.query('COMMIT');
        res.status(204).end();
      } catch (error) {
        if (ownsConnection) await connection.query('ROLLBACK');
        throw error;
      } finally {
        if (ownsConnection) connection.release();
      }
    },
  };
}

module.exports = { createController };
