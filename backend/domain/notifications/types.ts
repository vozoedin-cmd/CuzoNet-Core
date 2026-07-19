export const notificationStatuses = [
  'pending',
  'processing',
  'sent',
  'retrying',
  'failed',
  'cancelled',
  'skipped',
] as const;

export type NotificationStatus = (typeof notificationStatuses)[number];

export const notificationChannelTypes = ['webhook', 'whatsapp', 'telegram', 'email'] as const;

export type NotificationChannelType = (typeof notificationChannelTypes)[number];

export const notificationEventTypes = [
  'incident_opened',
  'incident_acknowledged',
  'incident_resolved',
] as const;

export type NotificationEventType = (typeof notificationEventTypes)[number];

export const notificationPriorities = ['low', 'normal', 'high', 'urgent'] as const;

export type NotificationPriority = (typeof notificationPriorities)[number];

export type NotificationAttemptStatus = 'processing' | 'sent' | 'retrying' | 'failed';

export type JsonPrimitive = boolean | number | string | null;
export type JsonValue =
  JsonPrimitive | readonly JsonValue[] | { readonly [key: string]: JsonValue };

export interface IncidentNotificationEvent {
  companyId: string;
  equipmentId: string;
  eventId: string;
  eventType: 'IncidentOpened.v1' | 'IncidentAcknowledged.v1' | 'IncidentResolved.v1';
  incidentId: string;
  occurredAt: string;
  ruleId: string;
  severity: 'info' | 'warning' | 'minor' | 'major' | 'critical';
}
