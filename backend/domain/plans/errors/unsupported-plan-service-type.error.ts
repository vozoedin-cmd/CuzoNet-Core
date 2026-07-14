import { ApplicationError } from '../../../shared/errors/application-error.js';

export class UnsupportedPlanServiceTypeError extends ApplicationError {
  public constructor() {
    super({
      code: 'UNSUPPORTED_PLAN_SERVICE_TYPE',
      message: 'La implementacion inicial solo soporta planes simple_queue.',
    });
    this.name = 'UnsupportedPlanServiceTypeError';
  }
}
