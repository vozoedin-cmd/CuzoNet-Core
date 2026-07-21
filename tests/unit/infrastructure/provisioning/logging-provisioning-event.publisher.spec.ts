import { describe, expect, it } from 'vitest';

import type { ProvisioningEventEnvelope } from '../../../../backend/application/ports/provisioning/provisioning-event-envelope.js';
import { LoggingProvisioningEventPublisher } from '../../../../backend/infrastructure/provisioning/events/logging-provisioning-event.publisher.js';

describe('LoggingProvisioningEventPublisher', () => {
  it('resolves without throwing for a well-formed event', async () => {
    const publisher = new LoggingProvisioningEventPublisher();
    const event: ProvisioningEventEnvelope = {
      aggregateId: 'req-1',
      aggregateType: 'ProvisioningRequest',
      causationId: 'req-1',
      companyId: 'company-1',
      correlationId: 'req-1',
      eventId: 'event-1',
      eventType: 'ProvisioningSucceeded.v1',
      occurredAt: '2026-07-20T12:00:00.000Z',
      payload: { requestId: 'req-1' },
      schemaVersion: 1,
    };

    await expect(publisher.publish(event)).resolves.toBeUndefined();
  });
});
