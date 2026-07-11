import type { RequestHandler } from 'express';

import { ApplicationError } from '../../../shared/errors/application-error.js';

export const notFoundMiddleware: RequestHandler = (_request, _response, next) => {
  next(
    new ApplicationError({
      code: 'RESOURCE_NOT_FOUND',
      message: 'Recurso no encontrado.',
    }),
  );
};
