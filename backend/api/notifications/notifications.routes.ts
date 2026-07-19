import { Router } from 'express';

import type { NotificationsController } from './notifications.controller.js';

export function createNotificationsRouter(controller: NotificationsController): Router {
  const router = Router();
  router.get('/notifications', controller.listNotifications);
  router.get('/notifications/:notificationId', controller.getNotification);
  router.post('/notifications/:notificationId/retry', controller.retryNotification);
  router.post('/notifications/:notificationId/cancel', controller.cancelNotification);
  router.get('/notification-destinations', controller.listDestinations);
  router.post('/notification-destinations', controller.createDestination);
  router.put('/notification-destinations/:destinationId', controller.updateDestination);
  router.delete('/notification-destinations/:destinationId', controller.deleteDestination);
  return router;
}
