
import type { DashboardController } from './dashboard.controller.js';

export interface HttpRouter {
  get: (path: string, handler: unknown) => void;
}

export function setupDashboardRoutes(router: HttpRouter, controller: DashboardController): void {
  router.get('/dashboard/overview', controller.getOverview.bind(controller));
  router.get('/dashboard/billing-summary', controller.getBillingSummary.bind(controller));
  router.get('/dashboard/network-health', controller.getNetworkHealth.bind(controller));
}
