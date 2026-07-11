import { ApplicationError } from '../../../shared/errors/application-error.js';

export interface ApiError {
  code: string;
  correlationId: string;
  fields?: readonly {
    message: string;
    path: string;
  }[];
  message: string;
}

export interface HttpError {
  code: string;
  fields?: readonly {
    message: string;
    path: string;
  }[];
  message: string;
  statusCode: number;
}

const applicationErrorStatusCodes: Readonly<Record<string, number>> = {
  CLIENT_CANNOT_RECEIVE_SERVICE: 409,
  CLIENT_DOCUMENT_CONFLICT: 409,
  INVALID_CLIENT_DATA: 422,
  INVALID_SERVICE_DATA: 422,
  RESOURCE_NOT_FOUND: 404,
  VALIDATION_ERROR: 422,
};

const internalServerError: HttpError = {
  code: 'INTERNAL_SERVER_ERROR',
  message: 'Error interno del servidor.',
  statusCode: 500,
};

export function toHttpError(error: unknown): HttpError {
  if (error instanceof ApplicationError) {
    const statusCode = applicationErrorStatusCodes[error.code];

    if (statusCode !== undefined) {
      return {
        code: error.code,
        ...(error.details === undefined ? {} : { fields: error.details }),
        message: error.message,
        statusCode,
      };
    }
  }

  return internalServerError;
}

export function toApiError(error: HttpError, correlationId: string): ApiError {
  return {
    code: error.code,
    correlationId,
    ...(error.fields === undefined ? {} : { fields: error.fields }),
    message: error.message,
  };
}
