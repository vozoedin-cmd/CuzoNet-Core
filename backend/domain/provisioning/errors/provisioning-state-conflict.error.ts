import { ApplicationError } from '../../../shared/errors/application-error.js';

export class ProvisioningStateConflictError extends ApplicationError {
  public constructor(message: string) {
    super({ code: 'PROVISIONING_STATE_CONFLICT', message });
    this.name = 'ProvisioningStateConflictError';
  }
}
