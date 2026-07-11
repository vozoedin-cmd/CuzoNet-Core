import { ApplicationError } from '../../../shared/errors/application-error.js';

export interface ApiError {
  code: string;
  correlationId: string;
  message: string;
}

export interface HttpError {
  code: string;
  message: string;
  statusCode: number;
}

const applicationErrorStatusCodes: Readonly<Record<string, number>> = {
  RESOURCE_NOT_FOUND: 404,
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
    message: error.message,
  };
}
