import { ApplicationError } from '../../../shared/errors/application-error.js';

export class ProvisioningOperationNotFoundError extends ApplicationError {
  public constructor() {
    super({ code: 'RESOURCE_NOT_FOUND', message: 'Operación no encontrada.' });
    this.name = 'ProvisioningOperationNotFoundError';
  }
}
