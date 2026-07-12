import { ApplicationError } from '../../../shared/errors/application-error.js';
export class BillingConflictError extends ApplicationError {
  public constructor(message: string) {
    super({ code: 'BILLING_CONFLICT', message });
    this.name = 'BillingConflictError';
  }
}
