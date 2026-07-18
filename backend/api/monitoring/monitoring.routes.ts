import { Router } from 'express';

import type { MonitoringController } from './monitoring.controller.js';

export function createMonitoringRouter(controller: MonitoringController): Router {
  const router = Router();
  router.post('/monitoring/batch', controller.recordBatch);
  router.get('/monitoring/equipment/:equipmentId/state', controller.getLatestState);
  router.get('/monitoring/equipment/:equipmentId/timeseries', controller.getTimeSeries);
  router.get('/monitoring/topology/:entityId/state', controller.getTopologyState);
  return router;
}
