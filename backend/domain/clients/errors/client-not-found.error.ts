import { ApplicationError } from '../../../shared/errors/application-error.js';

export class ClientNotFoundError extends ApplicationError {
  public constructor() {
    super({
      code: 'RESOURCE_NOT_FOUND',
      message: 'Cliente no encontrado.',
    });
    this.name = 'ClientNotFoundError';
  }
}
