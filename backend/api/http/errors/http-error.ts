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
  BILLING_CONFLICT: 409,
  CLIENT_CANNOT_RECEIVE_SERVICE: 409,
  CLIENT_DOCUMENT_CONFLICT: 409,
  CORS_HEADERS_NOT_ALLOWED: 403,
  CORS_METHOD_NOT_ALLOWED: 403,
  CORS_ORIGIN_NOT_ALLOWED: 403,
  INVALID_CLIENT_DATA: 422,
  INVALID_BILLING_DATA: 422,
  INVALID_SERVICE_DATA: 422,
  INVALID_PROVISIONING_DATA: 422,
  INVALID_PLAN_DATA: 422,
  PLAN_CODE_CONFLICT: 409,
  PROVISIONING_OPERATION_CONFLICT: 409,
  PROVISIONING_STATE_CONFLICT: 409,
  RESOURCE_NOT_FOUND: 404,
  UNSUPPORTED_PLAN_SERVICE_TYPE: 422,
  VALIDATION_ERROR: 422,
};

const internalServerError: HttpError = {
  code: 'INTERNAL_SERVER_ERROR',
  message: 'Error interno del servidor.',
  statusCode: 500,
};

export function toHttpError(error: unknown): HttpError {
  if (error !== null && typeof error === 'object' && 'type' in error) {
    if (error.type === 'entity.too.large') {
      return {
        code: 'PAYLOAD_TOO_LARGE',
        message: 'El cuerpo JSON excede el límite permitido.',
        statusCode: 413,
      };
    }

    if (error.type === 'entity.parse.failed') {
      return {
        code: 'INVALID_JSON',
        message: 'El cuerpo de la solicitud no contiene JSON válido.',
        statusCode: 400,
      };
    }
  }

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
