import { ApplicationError } from '../../../shared/errors/application-error.js';
export class AutomationRuleConflictError extends ApplicationError {
  public constructor(message: string) {
    super({ code: 'AUTOMATION_RULE_CONFLICT', message });
    this.name = 'AutomationRuleConflictError';
  }
}
