import { Router } from 'express';

import type { ServicesController } from '../controller/services.controller.js';

export function createServicesRouter(controller: ServicesController): Router {
  const router = Router();

  router.get('/clientes/:clientId/servicios', controller.listByClient);
  router.post('/clientes/:clientId/servicios', controller.create);
  router.get('/servicios/:serviceId', controller.get);

  return router;
}
