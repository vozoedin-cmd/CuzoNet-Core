import express, { type Express, type Router } from 'express';

import { errorHandlerMiddleware } from './middlewares/error-handler.middleware.js';
import { correlationIdMiddleware } from './middlewares/correlation-id.middleware.js';
import { notFoundMiddleware } from './middlewares/not-found.middleware.js';
import { requestLoggerMiddleware } from './middlewares/request-logger.middleware.js';
import { healthRouter } from './routes/health.route.js';

export interface AppDependencies {
  clientsRouter?: Router;
  servicesRouter?: Router;
}

export function createApp(dependencies: AppDependencies = {}): Express {
  const app = express();

  app.disable('x-powered-by');
  app.use(correlationIdMiddleware);
  app.use(requestLoggerMiddleware);
  app.use(express.json());
  app.use(healthRouter);
  if (dependencies.clientsRouter !== undefined) {
    app.use(dependencies.clientsRouter);
  }
  if (dependencies.servicesRouter !== undefined) {
    app.use(dependencies.servicesRouter);
  }
  app.use(notFoundMiddleware);
  app.use(errorHandlerMiddleware);

  return app;
}
