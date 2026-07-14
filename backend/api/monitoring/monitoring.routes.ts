import type { MonitoringController } from './monitoring.controller.js';

export interface HttpRouter {
  post: (path: string, handler: unknown) => void;
  get: (path: string, handler: unknown) => void;
}

export function setupMonitoringRoutes(router: HttpRouter, controller: MonitoringController): void {
  router.post('/monitoring/batch', controller.recordBatch.bind(controller));
  router.get('/monitoring/equipment/:equipmentId/state', controller.getLatestState.bind(controller));
  router.get('/monitoring/equipment/:equipmentId/timeseries', controller.getTimeSeries.bind(controller));
  router.get('/monitoring/topology/:entityId/state', controller.getTopologyState.bind(controller));
}
