
import type { NotificationChannel, NotificationStatus, RecipientAddress, TemplateVariables } from '../../../domain/notifications/types.js';

export interface CreateNotificationRequest {
  companyId: string;
  templateCode: string;
  destinations: { recipient: RecipientAddress, channel: NotificationChannel }[];
  variables: TemplateVariables;
  idempotencyKey?: string;
}

export interface NotificationDto {
  id: string;
  status: NotificationStatus;
  createdAt: Date;
}
