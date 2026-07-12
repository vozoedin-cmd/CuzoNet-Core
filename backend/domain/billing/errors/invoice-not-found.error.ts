import { ApplicationError } from '../../../shared/errors/application-error.js';
export class InvoiceNotFoundError extends ApplicationError {
  public constructor() {
    super({ code: 'RESOURCE_NOT_FOUND', message: 'Factura no encontrada.' });
    this.name = 'InvoiceNotFoundError';
  }
}
