import { ApplicationError } from '../../../shared/errors/application-error.js';

export class EquipmentNotFoundError extends ApplicationError {
  public constructor() {
    super({
      code: 'RESOURCE_NOT_FOUND',
      message: 'Equipo no encontrado.',
    });
    this.name = 'EquipmentNotFoundError';
  }
}
