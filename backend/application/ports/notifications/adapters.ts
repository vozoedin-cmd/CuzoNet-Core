
import type { NotificationDeliveryProps } from '../../../domain/notifications/notification.js';
import type { TemplateVariables } from '../../../domain/notifications/types.js';

export interface RenderedMessage {
  body: string;
  subject?: string;
}

export interface NotificationChannelAdapter {
  send(delivery: NotificationDeliveryProps, rendered: RenderedMessage): Promise<void>;
}

export interface ChannelAdapterProvider {
  getAdapter(channel: string): NotificationChannelAdapter;
}

export interface NotificationTemplateRenderer {
  render(templateBody: string, variables: TemplateVariables): string;
}
