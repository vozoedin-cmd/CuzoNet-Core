import { Router } from 'express';

import type { ClientsController } from '../controller/clients.controller.js';

export function createClientsRouter(controller: ClientsController): Router {
  const router = Router();

  router.get('/clientes', controller.list);
  router.post('/clientes', controller.create);
  router.get('/clientes/:clientId', controller.get);
  router.put('/clientes/:clientId', controller.update);
  router.delete('/clientes/:clientId', controller.archive);

  return router;
}
