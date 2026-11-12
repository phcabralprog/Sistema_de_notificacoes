const { Router } = require('express');
const { createController } = require('../controllers/projetos.controller');

module.exports = function projetosRoutes(db) {
  const router = Router();
  const controller = createController(db);
  router.get('/', controller.list);
  router.post('/', controller.create);
  router.get('/:id/funcionarios', controller.listEmployees);
  router.post('/:id/funcionarios', controller.addEmployees);
  router.delete('/:id/funcionarios/:funcionarioId', controller.removeEmployee);
  router.get('/:id', controller.get);
  router.put('/:id', controller.update);
  router.delete('/:id', controller.remove);
  return router;
};
