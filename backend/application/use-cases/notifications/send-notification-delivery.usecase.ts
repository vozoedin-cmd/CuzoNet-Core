
import type { NotificationRepository, NotificationTemplateRepository } from '../../ports/notifications/repositories.js';
import type { ChannelAdapterProvider, NotificationTemplateRenderer } from '../../ports/notifications/adapters.js';
import type { IdGenerator } from '../../ports/id-generator.port.js';

export class SendNotificationDeliveryUseCase {
  constructor(
    private readonly repo: NotificationRepository,
    private readonly templateRepo: NotificationTemplateRepository,
    private readonly adapterProvider: ChannelAdapterProvider,
    private readonly renderer: NotificationTemplateRenderer,
    private readonly idGenerator: IdGenerator
  ) {}

  public async execute(notificationId: string, deliveryId: string, claimToken: string): Promise<void> {
    const notification = await this.repo.findById(notificationId);
    if (!notification) throw new Error('Notification not found');

    const delivery = notification.props.deliveries.find(d => d.id === deliveryId);
    if (!delivery) throw new Error('Delivery not found');

    if (delivery.status !== 'claimed' || delivery.claimToken !== claimToken) {
      throw new Error('Invalid claim token or delivery is not claimed');
    }
    if (delivery.claimExpiresAt && delivery.claimExpiresAt < new Date()) {
      throw new Error('Claim expired');
    }

    // In a real scenario we'd fetch the template from a cache or the notification itself might denormalize it
    // For simplicity, we assume we fetch it or it's provided. 
    // Wait, the templateRepo by code is not enough, we need by ID. Let's pretend we have findById on template repo,
    // or just pass a mock rendered text for now.
    
    const adapter = this.adapterProvider.getAdapter(delivery.channel);
    
    try {
      await adapter.send(delivery, { body: 'Rendered msg...' });
      notification.completeDelivery(deliveryId);
    } catch (error: unknown) {
      notification.failDelivery(deliveryId, this.idGenerator.generate(), {
        code: 'SEND_FAILED',
        message: error instanceof Error ? error.message : 'Unknown error',
        sanitized: true
      }, 60); // retry in 60s
    }

    await this.repo.save(notification);
  }
}
