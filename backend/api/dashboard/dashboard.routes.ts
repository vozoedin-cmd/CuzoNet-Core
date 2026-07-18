import { Router } from 'express';

import type { DashboardController } from './dashboard.controller.js';

export function createDashboardRouter(controller: DashboardController): Router {
  const router = Router();
  router.get('/dashboard/overview', controller.getOverview);
  router.get('/dashboard/billing-summary', controller.getBillingSummary);
  router.get('/dashboard/network-health', controller.getNetworkHealth);
  return router;
}
