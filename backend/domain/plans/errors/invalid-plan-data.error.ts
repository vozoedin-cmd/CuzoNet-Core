import { ApplicationError } from '../../../shared/errors/application-error.js';

export class InvalidPlanDataError extends ApplicationError {
  public constructor(path: string, message: string) {
    super({
      code: 'INVALID_PLAN_DATA',
      details: [{ path, message }],
      message: 'Los datos del plan no son validos.',
    });
    this.name = 'InvalidPlanDataError';
  }
}
