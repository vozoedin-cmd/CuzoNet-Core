import { Router } from 'express';

import type { IncidentAlertingController } from './incident-alerting.controller.js';

export function createIncidentAlertingRouter(controller: IncidentAlertingController): Router {
  const router = Router();
  router.get('/incidents', controller.listIncidents);
  router.get('/incidents/:incidentId', controller.getIncident);
  router.post('/incidents/:incidentId/acknowledge', controller.acknowledgeIncident);
  router.get('/alert-rules', controller.listAlertRules);
  return router;
}
