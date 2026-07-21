import { describe, expect, it, vi, beforeEach } from 'vitest';

import type { ProvisioningEventEnvelope } from '../../../../backend/application/ports/provisioning/provisioning-event-envelope.js';
import type { ProvisioningEventPublisherPort } from '../../../../backend/application/ports/provisioning/provisioning-event-publisher.port.js';
import {
  ProvisioningEventDispatcher,
  type ProvisioningEventWorkItem,
  type SqliteProvisioningEventWorkRepository,
} from '../../../../backend/infrastructure/workers/provisioning-event-dispatcher.js';
import type { WorkerExecutionContext } from '../../../../backend/infrastructure/workers/worker-contracts.js';

function buildEnvelope(overrides: Partial<ProvisioningEventEnvelope> = {}): ProvisioningEventEnvelope {
  return {
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
    ...overrides,
  };
}

describe('ProvisioningEventDispatcher', () => {
  let work: { findNext: ReturnType<typeof vi.fn>; markProcessed: ReturnType<typeof vi.fn>; markFailed: ReturnType<typeof vi.fn> };
  let publisher: { publish: ReturnType<typeof vi.fn> };
  let logger: { info: ReturnType<typeof vi.fn>; warn: ReturnType<typeof vi.fn> };
  const clock = { now: () => new Date('2026-07-20T12:00:00.000Z') };

  function leaseContext(): WorkerExecutionContext {
    return {
      signal: new AbortController().signal,
      withLease: vi.fn().mockImplementation(async (_id, cb) => ({ acquired: true, value: await cb({ aborted: false }) })),
    };
  }

  beforeEach(() => {
    work = { findNext: vi.fn(), markProcessed: vi.fn().mockResolvedValue(undefined), markFailed: vi.fn().mockResolvedValue(undefined) };
    publisher = { publish: vi.fn() };
    logger = { info: vi.fn(), warn: vi.fn() };
  });

  function buildDispatcher(options?: { baseRetryDelayMs?: number; maxAttempts?: number }): ProvisioningEventDispatcher {
    return new ProvisioningEventDispatcher(
      work as unknown as SqliteProvisioningEventWorkRepository,
      publisher as unknown as ProvisioningEventPublisherPort,
      clock,
      options,
      logger,
    );
  }

  it('returns idle when there is nothing pending', async () => {
    work.findNext.mockResolvedValue(null);
    const dispatcher = buildDispatcher();

    const result = await dispatcher.runOnce(leaseContext());

    expect(result).toEqual({ outcome: 'idle' });
    expect(publisher.publish).not.toHaveBeenCalled();
  });

  it('publishes the event, marks the delivery processed, and logs eventId/eventType/published/attempt/duration/consumer', async () => {
    const item: ProvisioningEventWorkItem = { attemptCount: 0, deliveryId: 'delivery-1', event: buildEnvelope() };
    work.findNext.mockResolvedValue(item);
    publisher.publish.mockResolvedValue(undefined);
    const dispatcher = buildDispatcher();

    const result = await dispatcher.runOnce(leaseContext());

    expect(result).toEqual({ outcome: 'processed' });
    expect(publisher.publish).toHaveBeenCalledWith(item.event);
    expect(work.markProcessed).toHaveBeenCalledWith('delivery-1', clock.now());
    expect(work.markFailed).not.toHaveBeenCalled();

    expect(logger.info).toHaveBeenCalledTimes(1);
    const [fields] = logger.info.mock.calls[0]!;
    expect(fields).toMatchObject({
      attempt: 1,
      consumer: 'provisioning-events',
      eventId: 'event-1',
      eventType: 'ProvisioningSucceeded.v1',
      published: true,
    });
    expect(typeof fields.duration).toBe('number');
  });

  it('marks a temporary publisher failure as failed-with-retry and logs published:false', async () => {
    const item: ProvisioningEventWorkItem = { attemptCount: 0, deliveryId: 'delivery-1', event: buildEnvelope() };
    work.findNext.mockResolvedValue(item);
    publisher.publish.mockRejectedValue(new Error('consumer unavailable'));
    const dispatcher = buildDispatcher({ baseRetryDelayMs: 1_000, maxAttempts: 5 });

    const result = await dispatcher.runOnce(leaseContext());

    expect(result.outcome).toBe('retried');
    expect(work.markFailed).toHaveBeenCalledTimes(1);
    const [deliveryId, message, attempt, nextAttemptAt] = work.markFailed.mock.calls[0]!;
    expect(deliveryId).toBe('delivery-1');
    expect(message).toContain('consumer unavailable');
    expect(attempt).toBe(1);
    expect(nextAttemptAt).toBeInstanceOf(Date);
    expect((nextAttemptAt as Date).getTime()).toBeGreaterThan(clock.now().getTime());

    const [fields] = logger.warn.mock.calls[0]!;
    expect(fields).toMatchObject({ attempt: 1, consumer: 'provisioning-events', eventId: 'event-1', published: false });
  });

  it('stops scheduling retries once maxAttempts is reached', async () => {
    const item: ProvisioningEventWorkItem = { attemptCount: 4, deliveryId: 'delivery-1', event: buildEnvelope() };
    work.findNext.mockResolvedValue(item);
    publisher.publish.mockRejectedValue(new Error('still failing'));
    const dispatcher = buildDispatcher({ maxAttempts: 5 });

    await dispatcher.runOnce(leaseContext());

    const [, , attempt, nextAttemptAt] = work.markFailed.mock.calls[0]!;
    expect(attempt).toBe(5);
    expect(nextAttemptAt).toBeNull();
  });

  it('returns skipped when another worker already holds the lease', async () => {
    const item: ProvisioningEventWorkItem = { attemptCount: 0, deliveryId: 'delivery-1', event: buildEnvelope() };
    work.findNext.mockResolvedValue(item);
    const dispatcher = buildDispatcher();
    const context: WorkerExecutionContext = {
      signal: new AbortController().signal,
      withLease: vi.fn().mockResolvedValue({ acquired: false }),
    };

    const result = await dispatcher.runOnce(context);

    expect(result).toEqual({ outcome: 'skipped' });
    expect(publisher.publish).not.toHaveBeenCalled();
  });
});
