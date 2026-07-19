/** @legacy Modelo Alert/AlertPolicy de la migración 0014; no usar en Incident Alerting. */

import type { AlertingController } from './alerting.controller.js';

export interface HttpRouter {
  post: (path: string, handler: unknown) => void;
  get: (path: string, handler: unknown) => void;
}

export function setupAlertingRoutes(router: HttpRouter, controller: AlertingController): void {
  // Normally evaluatePolicies would be called by a cron job, but we expose an endpoint for manual trigger
  router.post('/alerting/evaluate', controller.evaluatePolicies.bind(controller));
  
  router.post('/alerting/alerts/:id/acknowledge', controller.acknowledgeAlert.bind(controller));
  router.post('/alerting/alerts/:id/resolve', controller.resolveAlert.bind(controller));
}
