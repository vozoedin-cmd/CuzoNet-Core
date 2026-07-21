import { describe, expect, it, vi } from 'vitest';

import { publishProvisioningEvents } from '../../../../backend/application/use-cases/provisioning/shared/publish-provisioning-events.js';
import { ProvisioningRequestedEvent } from '../../../../backend/domain/provisioning/events/provisioning-requested.event.js';
import type { ProvisioningEventPayload } from '../../../../backend/domain/provisioning/events/provisioning-event-payload.js';

function buildEvent(overrides: Partial<ProvisioningEventPayload> = {}): ProvisioningRequestedEvent {
  const payload: ProvisioningEventPayload = {
    action: 'create',
    actionType: 'routeros.simple_queue.create',
    attemptNumber: 1,
    companyId: 'company-1',
    occurredAt: '2026-07-20T12:00:00.000Z',
    requestId: 'req-1',
    resourceType: 'routeros.simple_queue',
    ...overrides,
  };
  return new ProvisioningRequestedEvent({
    aggregateId: 'req-1',
    causationId: 'req-1',
    correlationId: 'req-1',
    eventId: 'event-1',
    occurredAt: new Date('2026-07-20T12:00:00.000Z'),
    payload,
  });
}

describe('publishProvisioningEvents', () => {
  it('does nothing when there are no events to publish', async () => {
    const outbox = { append: vi.fn().mockResolvedValue(undefined) };
    const logger = { info: vi.fn(), warn: vi.fn() };

    await publishProvisioningEvents(outbox, [], logger);

    expect(outbox.append).not.toHaveBeenCalled();
    expect(logger.info).not.toHaveBeenCalled();
  });

  it('appends events to the outbox and logs eventName/requestId/attemptNumber/published/duration', async () => {
    const outbox = { append: vi.fn().mockResolvedValue(undefined) };
    const logger = { info: vi.fn(), warn: vi.fn() };
    const event = buildEvent();

    await publishProvisioningEvents(outbox, [event], logger);

    expect(outbox.append).toHaveBeenCalledWith([event]);
    expect(logger.info).toHaveBeenCalledTimes(1);
    const [fields] = logger.info.mock.calls[0]!;
    expect(fields).toMatchObject({
      attemptNumber: 1,
      eventName: 'ProvisioningRequested.v1',
      published: true,
      requestId: 'req-1',
    });
    expect(typeof fields.duration).toBe('number');
  });

  it('logs one entry per event when publishing a batch', async () => {
    const outbox = { append: vi.fn().mockResolvedValue(undefined) };
    const logger = { info: vi.fn(), warn: vi.fn() };
    const events = [buildEvent({ requestId: 'req-1' } as never), buildEvent({ requestId: 'req-1' } as never)];

    await publishProvisioningEvents(outbox, events, logger);

    expect(logger.info).toHaveBeenCalledTimes(2);
  });

  it('swallows outbox failures, logs published=false, and never rethrows', async () => {
    const outbox = { append: vi.fn().mockRejectedValue(new Error('db unavailable')) };
    const logger = { info: vi.fn(), warn: vi.fn() };
    const event = buildEvent();

    await expect(publishProvisioningEvents(outbox, [event], logger)).resolves.toBeUndefined();

    expect(logger.warn).toHaveBeenCalledTimes(1);
    const [fields] = logger.warn.mock.calls[0]!;
    expect(fields).toMatchObject({
      eventName: 'ProvisioningRequested.v1',
      published: false,
      requestId: 'req-1',
    });
  });

  it('defaults to a no-op logger when none is provided', async () => {
    const outbox = { append: vi.fn().mockResolvedValue(undefined) };

    await expect(publishProvisioningEvents(outbox, [buildEvent()])).resolves.toBeUndefined();
  });
});
