import type {
  NotificationListFilters,
  NotificationRepository,
} from '../../ports/notifications/repositories.js';

export class ListNotificationsUseCase {
  public constructor(private readonly notifications: NotificationRepository) {}

  public execute(companyId: string, filters: NotificationListFilters = {}) {
    return this.notifications.list(companyId, filters);
  }
}
