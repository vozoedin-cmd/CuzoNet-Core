
import type { NotificationChannelAdapter, RenderedMessage } from '../../application/ports/notifications/adapters.js';
import type { NotificationDeliveryProps } from '../../domain/notifications/notification.js';

export class FakeChannelAdapter implements NotificationChannelAdapter {
  constructor(private readonly shouldFail: boolean = false) {}

  public async send(_delivery: NotificationDeliveryProps, _rendered: RenderedMessage): Promise<void> {
    if (this.shouldFail) {
      throw new Error('Simulated fake failure');
    }
    // simulate delay
    await new Promise(resolve => setTimeout(resolve, 50));
  }
}
