import { Router } from 'express';

import type { DesiredResourceStateController } from '../controller/desired-resource-state.controller.js';

export function createDesiredResourceStateRouter(controller: DesiredResourceStateController): Router {
  const router = Router();
  const basePath = '/synchronization/routers/:routerId/desired-state/:resourceType';
  router.put(`${basePath}/:reference`, controller.set);
  router.delete(`${basePath}/:reference`, controller.remove);
  router.get(`${basePath}/:reference`, controller.get);
  router.get(basePath, controller.list);
  return router;
}
