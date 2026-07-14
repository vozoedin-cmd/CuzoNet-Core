import { ApplicationError } from '../../../shared/errors/application-error.js';

export class PlanNotFoundError extends ApplicationError {
  public constructor() {
    super({ code: 'RESOURCE_NOT_FOUND', message: 'El plan solicitado no existe.' });
    this.name = 'PlanNotFoundError';
  }
}
