import { ApplicationError } from '../../../shared/errors/application-error.js';

export class InvalidDesiredResourceStateError extends ApplicationError {
  public constructor(path: string, message: string) {
    super({
      code: 'INVALID_DESIRED_RESOURCE_STATE',
      details: [{ path, message }],
      message: 'El estado deseado declarado no es válido.',
    });
    this.name = 'InvalidDesiredResourceStateError';
  }
}
