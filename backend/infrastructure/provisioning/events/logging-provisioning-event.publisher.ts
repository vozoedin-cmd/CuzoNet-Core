import type { ProvisioningEventEnvelope } from '../../../application/ports/provisioning/provisioning-event-envelope.js';
import type { ProvisioningEventPublisherPort } from '../../../application/ports/provisioning/provisioning-event-publisher.port.js';
import { logger } from '../../logging/logger.js';

/**
 * Placeholder "external" publisher until a real consumer (n8n, WhatsApp,
 * Kafka, ...) is wired in: simply logs the event's identity, never its
 * payload verbatim, so it can never leak anything even if the payload
 * shape changes later.
 */
export class LoggingProvisioningEventPublisher implements ProvisioningEventPublisherPort {
  public async publish(event: ProvisioningEventEnvelope): Promise<void> {
    logger.info(
      {
        action: 'provisioning.event.consumer.publish',
        companyId: event.companyId,
        eventId: event.eventId,
        eventType: event.eventType,
        module: 'provisioning',
        requestId: (event.payload as { requestId?: unknown }).requestId,
      },
      'provisioning_event_dispatched',
    );
  }
}
