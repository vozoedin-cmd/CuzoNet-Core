import { Router } from 'express';
import type { BillingController } from '../controller/billing.controller.js';
export function createBillingRouter(controller: BillingController): Router {
  const router = Router();
  router.get('/pagos', controller.listPayments);
  router.post('/pagos', controller.recordPayment);
  router.get('/clientes/:clientId/cuenta', controller.getClientAccountSummary);
  return router;
}
