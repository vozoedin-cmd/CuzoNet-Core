import { Router } from 'express';
import type { ProvisioningRequestsController } from '../controller/provisioning-requests.controller.js';

export function createProvisioningRequestsRouter(controller: ProvisioningRequestsController): Router {
  const router = Router();

  router.post('/requests', (req, res, next) => {
    controller.request(req, res).catch(next);
  });

  router.get('/requests', (req, res, next) => {
    controller.list(req, res).catch(next);
  });

  router.get('/requests/:id', (req, res, next) => {
    controller.get(req, res).catch(next);
  });

  router.post('/requests/:id/cancel', (req, res, next) => {
    controller.cancel(req, res).catch(next);
  });

  return router;
}
