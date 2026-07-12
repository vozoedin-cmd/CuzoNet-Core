import { ApplicationError } from '../../../shared/errors/application-error.js';

export class InvalidBillingDataError extends ApplicationError {
  public constructor(path: string, message: string) {
    super({
      code: 'INVALID_BILLING_DATA',
      details: [{ path, message }],
      message: 'Los datos de Billing no son válidos.',
    });
    this.name = 'InvalidBillingDataError';
  }
}
