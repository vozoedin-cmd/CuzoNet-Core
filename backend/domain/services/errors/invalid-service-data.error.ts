import { ApplicationError } from '../../../shared/errors/application-error.js';

export class InvalidServiceDataError extends ApplicationError {
  public constructor(path: string, message: string) {
    super({
      code: 'INVALID_SERVICE_DATA',
      details: [{ path, message }],
      message: 'Los datos del servicio no son válidos.',
    });
    this.name = 'InvalidServiceDataError';
  }
}
