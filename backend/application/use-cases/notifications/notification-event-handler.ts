import type { NotificationOutboxEnvelope } from '../../ports/notifications/notification-event.port.js';
import type { CreateNotificationsFromIncidentEventUseCase } from './create-notifications-from-incident-event.usecase.js';

export class NotificationEventHandler {
  public constructor(
    private readonly createNotifications: CreateNotificationsFromIncidentEventUseCase,
  ) {}

  public handle(event: NotificationOutboxEnvelope) {
    return this.createNotifications.execute(event);
  }
}
