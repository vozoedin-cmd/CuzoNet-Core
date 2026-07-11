import { ApplicationError } from '../../../shared/errors/application-error.js';

export class InvalidClientDataError extends ApplicationError {
  public constructor(path: string, message: string) {
    super({
      code: 'INVALID_CLIENT_DATA',
      details: [{ path, message }],
      message: 'Los datos del cliente no son válidos.',
    });
    this.name = 'InvalidClientDataError';
  }
}
