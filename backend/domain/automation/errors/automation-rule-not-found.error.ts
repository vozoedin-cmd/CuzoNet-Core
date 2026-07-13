import { ApplicationError } from '../../../shared/errors/application-error.js';
export class AutomationRuleNotFoundError extends ApplicationError {
  public constructor() {
    super({ code: 'RESOURCE_NOT_FOUND', message: 'Regla de Automation no encontrada.' });
    this.name = 'AutomationRuleNotFoundError';
  }
}
