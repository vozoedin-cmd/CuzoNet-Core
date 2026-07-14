import { ApplicationError } from '../../../shared/errors/application-error.js';

export class DuplicatePlanCodeError extends ApplicationError {
  public constructor() {
    super({ code: 'PLAN_CODE_CONFLICT', message: 'Ya existe un plan con el mismo codigo.' });
    this.name = 'DuplicatePlanCodeError';
  }
}
