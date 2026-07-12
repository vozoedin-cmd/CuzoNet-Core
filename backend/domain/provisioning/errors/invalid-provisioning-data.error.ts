import { ApplicationError } from '../../../shared/errors/application-error.js';

export class InvalidProvisioningDataError extends ApplicationError {
  public constructor(path: string, message: string) {
    super({
      code: 'INVALID_PROVISIONING_DATA',
      details: [{ path, message }],
      message: 'Los datos de Provisioning no son válidos.',
    });
    this.name = 'InvalidProvisioningDataError';
  }
}
