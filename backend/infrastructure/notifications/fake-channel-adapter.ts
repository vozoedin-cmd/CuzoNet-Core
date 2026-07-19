import type {
  NotificationChannel,
  NotificationChannelSendInput,
  NotificationSendResult,
} from '../../application/ports/notifications/channels.js';
import type { NotificationChannelType } from '../../domain/notifications/types.js';

/** Test double only. It never performs network I/O. */
export class FakeNotificationChannel implements NotificationChannel {
  public readonly sent: NotificationChannelSendInput[] = [];

  public constructor(
    public readonly type: NotificationChannelType,
    private readonly result: NotificationSendResult = { type: 'success' },
  ) {}

  public async send(input: NotificationChannelSendInput): Promise<NotificationSendResult> {
    this.sent.push(input);
    return this.result;
  }
}

export { FakeNotificationChannel as FakeChannelAdapter };
