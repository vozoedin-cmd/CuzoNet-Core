import { ApplicationError } from '../../../shared/errors/application-error.js';
export class UnsupportedAutomationActionError extends ApplicationError {
  public constructor() {
    super({
      code: 'UNSUPPORTED_AUTOMATION_ACTION',
      message: 'La acción no está permitida para Automation.',
    });
    this.name = 'UnsupportedAutomationActionError';
  }
}
