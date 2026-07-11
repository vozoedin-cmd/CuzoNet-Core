export interface ApplicationErrorOptions {
  code: string;
  message: string;
}

/**
 * Error transversal con información segura para consumidores externos.
 * No contiene estado ni detalles propios de ningún transporte.
 */
export class ApplicationError extends Error {
  public readonly code: string;

  public constructor({ code, message }: ApplicationErrorOptions) {
    super(message);
    this.name = 'ApplicationError';
    this.code = code;
  }
}
