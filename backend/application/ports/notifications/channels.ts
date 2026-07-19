import type { NotificationDestination } from '../../../domain/notifications/notification-destination.js';
import type { RenderedNotification } from '../../../domain/notifications/notification-template.js';
import type { JsonValue, NotificationChannelType } from '../../../domain/notifications/types.js';

export interface WebhookNotificationCredentials {
  bearerToken?: string;
  channel: 'webhook';
  url: string;
}

export interface WhatsAppNotificationCredentials {
  apiKey: string;
  baseUrl: string;
  channel: 'whatsapp';
  defaultCountryCode?: string;
  instanceName: string;
  timeoutMs?: number;
}

export interface DisabledNotificationCredentials {
  channel: 'email' | 'telegram';
  configurationReference: string;
}

export type NotificationCredentials =
  | WebhookNotificationCredentials
  | WhatsAppNotificationCredentials
  | DisabledNotificationCredentials;

export interface NotificationCredentialProvider {
  get(input: {
    channel: NotificationChannelType;
    companyId: string;
    destination: NotificationDestination;
  }): Promise<NotificationCredentials | null>;
}

export type NotificationSendResult =
  | {
      providerMessageId?: string;
      responseCode?: number;
      safeMetadata?: Readonly<Record<string, JsonValue>>;
      type: 'success';
    }
  | {
      errorCode: string;
      errorMessage: string;
      responseCode?: number;
      safeMetadata?: Readonly<Record<string, JsonValue>>;
      type: 'retryableFailure';
    }
  | {
      errorCode: string;
      errorMessage: string;
      responseCode?: number;
      safeMetadata?: Readonly<Record<string, JsonValue>>;
      type: 'permanentFailure';
    };

export interface NotificationChannelSendInput {
  credentials: NotificationCredentials;
  destination: NotificationDestination;
  rendered: RenderedNotification;
}

export interface NotificationChannel {
  readonly type: NotificationChannelType;
  send(input: NotificationChannelSendInput): Promise<NotificationSendResult>;
}
