import { ApplicationError } from '../../../shared/errors/application-error.js';

export class ProvisioningOperationConflictError extends ApplicationError {
  public constructor(message = 'Ya existe una operación de Provisioning no terminal.') {
    super({ code: 'PROVISIONING_OPERATION_CONFLICT', message });
    this.name = 'ProvisioningOperationConflictError';
  }
}
