import { ApplicationError } from '../../../shared/errors/application-error.js';

export class ClientCannotReceiveServiceError extends ApplicationError {
  public constructor() {
    super({
      code: 'CLIENT_CANNOT_RECEIVE_SERVICE',
      message: 'El cliente no puede recibir nuevos servicios.',
    });
    this.name = 'ClientCannotReceiveServiceError';
  }
}
