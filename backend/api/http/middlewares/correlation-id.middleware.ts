import { randomUUID } from 'node:crypto';

import type { RequestHandler } from 'express';

const SAFE_CORRELATION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

function getCorrelationId(requestedCorrelationId: string | undefined): string {
  if (
    requestedCorrelationId !== undefined &&
    SAFE_CORRELATION_ID_PATTERN.test(requestedCorrelationId)
  ) {
    return requestedCorrelationId;
  }

  return randomUUID();
}

export const correlationIdMiddleware: RequestHandler = (request, response, next) => {
  const correlationId = getCorrelationId(request.get('X-Correlation-Id'));

  request.correlationId = correlationId;
  response.setHeader('X-Correlation-Id', correlationId);

  next();
};
