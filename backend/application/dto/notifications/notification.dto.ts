import type {
  NotificationChannelType,
  NotificationPriority,
  NotificationStatus,
} from '../../../domain/notifications/types.js';

export interface NotificationDto {
  channel: NotificationChannelType;
  id: string;
  priority: NotificationPriority;
  status: NotificationStatus;
}
