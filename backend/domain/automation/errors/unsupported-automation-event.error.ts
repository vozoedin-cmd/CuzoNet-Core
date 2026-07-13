import { ApplicationError } from '../../../shared/errors/application-error.js';
export class UnsupportedAutomationEventError extends ApplicationError {
  public constructor() {
    super({
      code: 'UNSUPPORTED_AUTOMATION_EVENT',
      message: 'El evento no está autorizado para Automation.',
    });
    this.name = 'UnsupportedAutomationEventError';
  }
}
