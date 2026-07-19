import type {
  NotificationChannel,
  NotificationChannelSendInput,
  NotificationSendResult,
} from '../../application/ports/notifications/channels.js';
import type { NotificationChannelType } from '../../domain/notifications/types.js';

abstract class DisabledNotificationChannel implements NotificationChannel {
  public abstract readonly type: NotificationChannelType;

  public async send(_input: NotificationChannelSendInput): Promise<NotificationSendResult> {
    return {
      errorCode: 'CHANNEL_DISABLED',
      errorMessage: `El canal ${this.type} está deshabilitado en esta versión.`,
      type: 'permanentFailure',
    };
  }
}


export class DisabledTelegramNotificationChannel extends DisabledNotificationChannel {
  public readonly type = 'telegram' as const;
}

export class DisabledEmailNotificationChannel extends DisabledNotificationChannel {
  public readonly type = 'email' as const;
}
