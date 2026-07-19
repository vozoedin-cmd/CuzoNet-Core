import { ApplicationError } from '../../../shared/errors/application-error.js';

export class IncidentNotFoundError extends ApplicationError {
  public constructor() {
    super({ code: 'RESOURCE_NOT_FOUND', message: 'Incidente no encontrado.' });
  }
}
