import { Router } from 'express';

import type { EquipmentController } from './equipment.controller.js';

export function createEquipmentRouter(controller: EquipmentController): Router {
  const router = Router();
  router.post('/equipments', controller.create);
  return router;
}
