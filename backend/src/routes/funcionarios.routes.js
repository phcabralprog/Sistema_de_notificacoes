const { Router } = require('express');
const { createController } = require('../controllers/funcionarios.controller');
const { createController: createProjectsController } = require('../controllers/projetos.controller');

module.exports = function funcionariosRoutes(db) {
  const router = Router();
  const controller = createController(db);
  const projectsController = createProjectsController(db);
  router.get('/', controller.list);
  router.get('/:eid/projetos', projectsController.listEmployeeProjects);
  router.get('/:eid', controller.get);
  router.post('/', controller.create);
  router.put('/:eid', controller.update);
  router.delete('/:eid', controller.remove);
  return router;
};
