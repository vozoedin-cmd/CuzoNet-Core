import { ApplicationError } from '../../../shared/errors/application-error.js';

export class ServiceNotFoundError extends ApplicationError {
  public constructor() {
    super({
      code: 'RESOURCE_NOT_FOUND',
      message: 'Servicio no encontrado.',
    });
    this.name = 'ServiceNotFoundError';
  }
}
