import { ApplicationError } from '../../../shared/errors/application-error.js';

export class IncidentStateConflictError extends ApplicationError {
  public constructor(message = 'La transición del incidente no es válida.') {
    super({ code: 'INCIDENT_STATE_CONFLICT', message });
  }
}
