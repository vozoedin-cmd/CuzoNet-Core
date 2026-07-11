import type { ErrorRequestHandler } from 'express';

import { logger } from '../../../infrastructure/logging/logger.js';
import { toApiError, toHttpError } from '../errors/http-error.js';

export const errorHandlerMiddleware: ErrorRequestHandler = (error, request, response, _next) => {
  const httpError = toHttpError(error);
  const errorName = error instanceof Error ? error.name : 'UnknownError';

  logger.error({
    action: 'http.request.failed',
    code: httpError.code,
    correlationId: request.correlationId,
    errorName,
    method: request.method,
    module: 'api.http',
    path: request.path,
    statusCode: httpError.statusCode,
  });

  response
    .status(httpError.statusCode)
    .json(toApiError(httpError, request.correlationId));
};
