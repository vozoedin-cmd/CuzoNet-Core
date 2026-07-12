import { ApplicationError } from '../../../shared/errors/application-error.js';
export class BillingAccountNotFoundError extends ApplicationError {
  public constructor() {
    super({ code: 'RESOURCE_NOT_FOUND', message: 'Cuenta de facturación no encontrada.' });
    this.name = 'BillingAccountNotFoundError';
  }
}
