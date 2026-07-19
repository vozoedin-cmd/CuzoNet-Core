import type {
  NotificationAttemptRepository,
  NotificationRepository,
} from '../../ports/notifications/repositories.js';
import { NotificationNotFoundError } from '../../../domain/notifications/notification-errors.js';

export class GetNotificationUseCase {
  public constructor(
    private readonly notifications: NotificationRepository,
    private readonly attempts: NotificationAttemptRepository,
  ) {}

  public async execute(companyId: string, notificationId: string) {
    const notification = await this.notifications.findById(companyId, notificationId);
    if (notification === null) throw new NotificationNotFoundError();
    return {
      attempts: await this.attempts.findByNotificationId(notificationId),
      notification,
    };
  }
}
