import type { Clock } from '../../ports/clock.port.js';
import type { NotificationRepository } from '../../ports/notifications/repositories.js';
import { NotificationNotFoundError } from '../../../domain/notifications/notification-errors.js';

export class RetryNotificationUseCase {
  public constructor(
    private readonly notifications: NotificationRepository,
    private readonly clock: Clock,
  ) {}

  public async execute(companyId: string, notificationId: string) {
    const notification = await this.notifications.findById(companyId, notificationId);
    if (notification === null) throw new NotificationNotFoundError();
    notification.scheduleManualRetry(this.clock.now());
    await this.notifications.save(notification);
    return notification;
  }
}
