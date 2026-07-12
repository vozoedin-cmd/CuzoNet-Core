import { Router } from 'express';

import type { ProvisioningController } from '../controller/provisioning.controller.js';

export function createProvisioningRouter(controller: ProvisioningController): Router {
  const router = Router();
  router.post('/servicios/:serviceId/operaciones', controller.request);
  router.get('/operaciones/:operationId', controller.get);
  return router;
}
