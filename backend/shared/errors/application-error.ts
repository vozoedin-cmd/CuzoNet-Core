export interface ApplicationErrorDetail {
  message: string;
  path: string;
}

export interface ApplicationErrorOptions {
  code: string;
  details?: readonly ApplicationErrorDetail[];
  message: string;
}

/**
 * Error transversal con información segura para consumidores externos.
 * No contiene estado ni detalles propios de ningún transporte.
 */
export class ApplicationError extends Error {
  public readonly code: string;
  public readonly details: readonly ApplicationErrorDetail[] | undefined;

  public constructor({ code, details, message }: ApplicationErrorOptions) {
    super(message);
    this.name = 'ApplicationError';
    this.code = code;
    this.details = details;
  }
}
