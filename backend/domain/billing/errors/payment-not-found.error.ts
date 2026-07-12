import { ApplicationError } from '../../../shared/errors/application-error.js';
export class PaymentNotFoundError extends ApplicationError {
  public constructor() {
    super({ code: 'RESOURCE_NOT_FOUND', message: 'Pago no encontrado.' });
    this.name = 'PaymentNotFoundError';
  }
}
