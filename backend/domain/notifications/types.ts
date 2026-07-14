
export type NotificationChannel = 'whatsapp' | 'telegram' | 'email' | 'webhook';
export type NotificationStatus = 'queued' | 'processing' | 'partially_delivered' | 'delivered' | 'failed' | 'cancelled';
export type DeliveryStatus = 'pending' | 'claimed' | 'sent' | 'failed' | 'cancelled' | 'manual_review';

export interface TemplateVariables {
  [key: string]: unknown;
}

export interface DeliveryError {
  code: string;
  message: string;
  sanitized: boolean;
}

export interface RecipientAddress {
  recipientId: string;
  address: string; // phone number, email, chat id, url
}
