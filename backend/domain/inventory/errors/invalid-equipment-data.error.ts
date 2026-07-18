import { ApplicationError } from '../../../shared/errors/application-error.js';

export class InvalidEquipmentDataError extends ApplicationError {
  public constructor(path: string, message: string) {
    super({
      code: 'INVALID_EQUIPMENT_DATA',
      details: [{ path, message }],
      message: 'Los datos del equipo no son válidos.',
    });
    this.name = 'InvalidEquipmentDataError';
  }
}
