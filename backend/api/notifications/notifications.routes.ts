
import type { NotificationsController } from './notifications.controller.js';

export interface HttpRouter {
  post: (path: string, handler: unknown) => void;
  get: (path: string, handler: unknown) => void;
}

export function setupNotificationsRoutes(router: HttpRouter, controller: NotificationsController): void {
  router.post('/notificaciones', controller.createNotification.bind(controller));
}
