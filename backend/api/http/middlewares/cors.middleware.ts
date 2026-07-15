import type { RequestHandler } from 'express';

import { ApplicationError } from '../../../shared/errors/application-error.js';

const ALLOWED_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'] as const;
const ALLOWED_HEADERS = [
  'Content-Type',
  'Authorization',
  'X-Correlation-Id',
  'Idempotency-Key',
] as const;
const EXPOSED_HEADERS = ['X-Correlation-Id'] as const;
const allowedMethodSet = new Set<string>(ALLOWED_METHODS);
const allowedHeaderSet = new Set(ALLOWED_HEADERS.map((header) => header.toLowerCase()));

function parseAllowedOrigins(value: string): ReadonlySet<string> {
  const origins = value
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);

  if (origins.length === 0 || origins.includes('*')) {
    throw new Error('CORS_ALLOWED_ORIGINS debe contener orígenes explícitos.');
  }

  return new Set(origins);
}

function parseRequestedHeaders(value: string | undefined): readonly string[] {
  if (value === undefined) {
    return [];
  }

  return value
    .split(',')
    .map((header) => header.trim().toLowerCase())
    .filter((header) => header.length > 0);
}

export function createCorsMiddleware(allowedOriginsValue: string): RequestHandler {
  const allowedOrigins = parseAllowedOrigins(allowedOriginsValue);

  return (request, response, next) => {
    const origin = request.get('Origin');

    if (origin === undefined) {
      next();
      return;
    }

    response.vary('Origin');

    if (!allowedOrigins.has(origin)) {
      next(
        new ApplicationError({
          code: 'CORS_ORIGIN_NOT_ALLOWED',
          message: 'El origen de la solicitud no está permitido por CORS.',
        }),
      );
      return;
    }

    response.setHeader('Access-Control-Allow-Origin', origin);
    response.setHeader('Access-Control-Allow-Methods', ALLOWED_METHODS.join(', '));
    response.setHeader('Access-Control-Allow-Headers', ALLOWED_HEADERS.join(', '));
    response.setHeader('Access-Control-Expose-Headers', EXPOSED_HEADERS.join(', '));

    if (request.method !== 'OPTIONS') {
      next();
      return;
    }

    response.vary('Access-Control-Request-Method');
    response.vary('Access-Control-Request-Headers');

    const requestedMethod = request.get('Access-Control-Request-Method')?.toUpperCase();
    if (requestedMethod === undefined || !allowedMethodSet.has(requestedMethod)) {
      next(
        new ApplicationError({
          code: 'CORS_METHOD_NOT_ALLOWED',
          message: 'El método solicitado no está permitido por CORS.',
        }),
      );
      return;
    }

    const requestedHeaders = parseRequestedHeaders(request.get('Access-Control-Request-Headers'));
    if (requestedHeaders.some((header) => !allowedHeaderSet.has(header))) {
      next(
        new ApplicationError({
          code: 'CORS_HEADERS_NOT_ALLOWED',
          message: 'Uno o más headers solicitados no están permitidos por CORS.',
        }),
      );
      return;
    }

    response.status(204).end();
  };
}
