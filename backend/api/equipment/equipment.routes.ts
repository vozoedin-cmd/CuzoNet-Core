import type { EquipmentController } from './equipment.controller.js';

export interface HttpRouter {
  post: (path: string, handler: unknown) => void;
}

export function setupEquipmentRoutes(router: HttpRouter, controller: EquipmentController): void {
  router.post('/equipments', controller.create.bind(controller));
}
