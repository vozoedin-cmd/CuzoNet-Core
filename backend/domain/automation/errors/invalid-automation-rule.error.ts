import { ApplicationError } from '../../../shared/errors/application-error.js';
export class InvalidAutomationRuleError extends ApplicationError {
  public constructor(path: string, message: string) {
    super({
      code: 'INVALID_AUTOMATION_RULE',
      details: [{ path, message }],
      message: 'La regla de Automation no es válida.',
    });
    this.name = 'InvalidAutomationRuleError';
  }
}
