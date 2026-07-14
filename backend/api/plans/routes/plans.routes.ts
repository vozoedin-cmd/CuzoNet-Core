import { Router } from 'express';

import type { PlansController } from '../controller/plans.controller.js';

export function createPlansRouter(controller: PlansController): Router {
  const router = Router();
  router.get('/planes', controller.list);
  router.post('/planes', controller.create);
  router.put('/planes/:planId', controller.revise);
  return router;
}
