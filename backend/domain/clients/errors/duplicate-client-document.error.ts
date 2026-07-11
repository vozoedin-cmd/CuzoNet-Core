import { ApplicationError } from '../../../shared/errors/application-error.js';

export class DuplicateClientDocumentError extends ApplicationError {
  public constructor() {
    super({
      code: 'CLIENT_DOCUMENT_CONFLICT',
      message: 'Ya existe un cliente activo con ese documento.',
    });
    this.name = 'DuplicateClientDocumentError';
  }
}
