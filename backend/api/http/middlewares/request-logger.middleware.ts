import type { RequestHandler } from 'express';

import { logger } from '../../../infrastructure/logging/logger.js';

export const requestLoggerMiddleware: RequestHandler = (request, response, next) => {
  const startedAt = process.hrtime.bigint();

  response.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;

    logger.info({
      action: 'http.request.completed',
      correlationId: request.correlationId,
      durationMs,
      method: request.method,
      module: 'api.http',
      path: request.path,
      statusCode: response.statusCode,
    });
  });

  next();
};
