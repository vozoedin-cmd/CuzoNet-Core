import { Router } from 'express';

import type { SynchronizationController } from '../controller/synchronization.controller.js';

export function createSynchronizationRouter(controller: SynchronizationController): Router {
  const router = Router();
  router.get('/synchronization/routers/:routerId/reconciliation-plan', controller.getReconciliationPlan);
  return router;
}
