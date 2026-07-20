import express, { type Express, type Router } from 'express';

import { errorHandlerMiddleware } from './middlewares/error-handler.middleware.js';
import { correlationIdMiddleware } from './middlewares/correlation-id.middleware.js';
import { createCorsMiddleware } from './middlewares/cors.middleware.js';
import { notFoundMiddleware } from './middlewares/not-found.middleware.js';
import { requestLoggerMiddleware } from './middlewares/request-logger.middleware.js';
import { healthRouter } from './routes/health.route.js';

export interface AppDependencies {
  alertingRouter?: Router;
  billingRouter?: Router;
  clientsRouter?: Router;
  dashboardRouter?: Router;
  equipmentRouter?: Router;
  monitoringRouter?: Router;
  notificationsRouter?: Router;
  plansRouter?: Router;
  provisioningRouter?: Router;
  provisioningRequestsRouter?: Router;
  servicesRouter?: Router;
}

export interface AppConfig {
  apiPrefix?: string;
  corsAllowedOrigins?: string;
}

const DEFAULT_API_PREFIX = '/api/v1';
const DEFAULT_CORS_ALLOWED_ORIGINS = 'http://localhost:3000';
const JSON_BODY_LIMIT = '1mb';

export function createApp(dependencies: AppDependencies = {}, config: AppConfig = {}): Express {
  const app = express();
  const apiRouter = express.Router();
  const apiPrefix = config.apiPrefix ?? DEFAULT_API_PREFIX;
  const corsAllowedOrigins = config.corsAllowedOrigins ?? DEFAULT_CORS_ALLOWED_ORIGINS;

  app.disable('x-powered-by');
  app.use(correlationIdMiddleware);
  app.use(requestLoggerMiddleware);
  app.use(createCorsMiddleware(corsAllowedOrigins));
  app.use(express.json({ limit: JSON_BODY_LIMIT }));
  apiRouter.use(healthRouter);
  if (dependencies.alertingRouter !== undefined) {
    apiRouter.use(dependencies.alertingRouter);
  }
  if (dependencies.billingRouter !== undefined) {
    apiRouter.use(dependencies.billingRouter);
  }
  if (dependencies.clientsRouter !== undefined) {
    apiRouter.use(dependencies.clientsRouter);
  }
  if (dependencies.dashboardRouter !== undefined) {
    apiRouter.use(dependencies.dashboardRouter);
  }
  if (dependencies.equipmentRouter !== undefined) {
    apiRouter.use(dependencies.equipmentRouter);
  }
  if (dependencies.monitoringRouter !== undefined) {
    apiRouter.use(dependencies.monitoringRouter);
  }
  if (dependencies.notificationsRouter !== undefined) {
    apiRouter.use(dependencies.notificationsRouter);
  }
  if (dependencies.plansRouter !== undefined) {
    apiRouter.use(dependencies.plansRouter);
  }
  if (dependencies.servicesRouter !== undefined) {
    apiRouter.use(dependencies.servicesRouter);
  }
  if (dependencies.provisioningRouter !== undefined) {
    apiRouter.use(dependencies.provisioningRouter);
  }
  if (dependencies.provisioningRequestsRouter !== undefined) {
    apiRouter.use(dependencies.provisioningRequestsRouter);
  }
  app.use(apiPrefix, apiRouter);
  app.use(notFoundMiddleware);
  app.use(errorHandlerMiddleware);

  return app;
}
