import { ApplicationError } from '../../shared/errors/application-error.js';

export class NotificationNotFoundError extends ApplicationError {
  public constructor() {
    super({ code: 'RESOURCE_NOT_FOUND', message: 'Notificación no encontrada.' });
  }
}

export class NotificationDestinationNotFoundError extends ApplicationError {
  public constructor() {
    super({ code: 'RESOURCE_NOT_FOUND', message: 'Destino de notificación no encontrado.' });
  }
}

export class NotificationStateConflictError extends ApplicationError {
  public constructor(message: string) {
    super({ code: 'NOTIFICATION_STATE_CONFLICT', message });
  }
}

export class NotificationDestinationConflictError extends ApplicationError {
  public constructor(message: string) {
    super({ code: 'NOTIFICATION_DESTINATION_CONFLICT', message });
  }
}
