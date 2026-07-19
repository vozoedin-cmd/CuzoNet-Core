import type { Notification } from '../../../domain/notifications/notification.js';
import type { NotificationAttempt } from '../../../domain/notifications/notification-attempt.js';
import type { NotificationDestination } from '../../../domain/notifications/notification-destination.js';
import type {
  NotificationChannelType,
  NotificationStatus,
} from '../../../domain/notifications/types.js';

export interface NotificationListFilters {
  channel?: NotificationChannelType;
  dateFrom?: Date;
  dateTo?: Date;
  destinationId?: string;
  incidentId?: string;
  limit?: number;
  offset?: number;
  status?: NotificationStatus;
}

export interface ClaimPendingNotificationInput {
  leaseDurationSeconds: number;
  now: Date;
  workerId: string;
}

export interface NotificationRepository {
  claimNextPending(input: ClaimPendingNotificationInput): Promise<Notification | null>;
  findById(companyId: string, notificationId: string): Promise<Notification | null>;
  findByIdempotencyKey(companyId: string, idempotencyKey: string): Promise<Notification | null>;
  list(companyId: string, filters?: NotificationListFilters): Promise<readonly Notification[]>;
  save(notification: Notification): Promise<void>;
}

export interface NotificationAttemptRepository {
  findByNotificationId(notificationId: string): Promise<readonly NotificationAttempt[]>;
  save(attempt: NotificationAttempt): Promise<void>;
}

export interface NotificationDestinationRepository {
  delete(companyId: string, destinationId: string): Promise<boolean>;
  findById(companyId: string, destinationId: string): Promise<NotificationDestination | null>;
  findByName(companyId: string, name: string): Promise<NotificationDestination | null>;
  list(companyId: string): Promise<readonly NotificationDestination[]>;
  save(destination: NotificationDestination): Promise<void>;
}

export interface NotificationEventReceipt {
  companyId: string;
  createdNotifications: number;
  eventId: string;
  eventType: string;
  lastError?: string;
  processedAt: Date;
  status: 'processed' | 'failed';
}

export interface NotificationEventReceiptRepository {
  findByEventId(eventId: string): Promise<NotificationEventReceipt | null>;
  save(receipt: NotificationEventReceipt): Promise<void>;
}

export interface NotificationUnitOfWork {
  execute<T>(work: () => Promise<T>): Promise<T>;
}
