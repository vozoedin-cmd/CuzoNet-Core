
import type { Notification } from '../../../domain/notifications/notification.js';
import type { NotificationTemplate } from '../../../domain/notifications/notification-template.js';

export interface NotificationRepository {
  save(notification: Notification): Promise<void>;
  findById(id: string): Promise<Notification | null>;
}

export interface NotificationTemplateRepository {
  findByCode(companyId: string, code: string): Promise<NotificationTemplate | null>;
  save(template: NotificationTemplate): Promise<void>;
}

export interface NotificationIdempotencyPort {
  checkAndLock(key: string): Promise<boolean>;
}
