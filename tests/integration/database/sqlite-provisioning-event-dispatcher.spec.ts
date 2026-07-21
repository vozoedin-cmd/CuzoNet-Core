import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type {
  ProvisioningActionAdapter,
  ProvisioningActionInput,
  ProvisioningActionResult,
} from '../../../backend/application/ports/provisioning/provisioning-action-adapter.port.js';
import type { ProvisioningEventEnvelope } from '../../../backend/application/ports/provisioning/provisioning-event-envelope.js';
import { DispatchProvisioningRequest } from '../../../backend/application/use-cases/provisioning/dispatch-provisioning-request/dispatch-provisioning-request.use-case.js';
import { RequestProvisioning } from '../../../backend/application/use-cases/provisioning/request-provisioning/request-provisioning.use-case.js';
import { ProvisioningRetryPolicy } from '../../../backend/domain/provisioning/services/provisioning-retry-policy.js';
import { SqliteProvisioningAttemptRepository } from '../../../backend/infrastructure/database/provisioning/sqlite/sqlite-provisioning-attempt.repository.js';
import { SqliteProvisioningRequestRepository } from '../../../backend/infrastructure/database/provisioning/sqlite/sqlite-provisioning-request.repository.js';
import { CompanyBootstrap } from '../../../backend/infrastructure/database/sqlite/bootstrap/company-bootstrap.js';
import { MigrationRunner } from '../../../backend/infrastructure/database/sqlite/migration/migration-runner.js';
import { SqliteDatabase } from '../../../backend/infrastructure/database/sqlite/sqlite-database.js';
import { SqliteOutboxRepository } from '../../../backend/infrastructure/events/sqlite/sqlite-outbox-repository.js';
import { UuidV7IdGenerator } from '../../../backend/infrastructure/identity/uuid-v7-id-generator.js';
import { InMemoryProvisioningEventPublisher } from '../../../backend/infrastructure/provisioning/events/in-memory-provisioning-event.publisher.js';
import { SqliteWorkLeaseRepository } from '../../../backend/infrastructure/workers/sqlite/sqlite-work-lease-repository.js';
import { SqliteWorkerStatisticsRepository } from '../../../backend/infrastructure/workers/sqlite/sqlite-worker-statistics-repository.js';
import { OutboxWorker, SqliteOutboxWorkRepository } from '../../../backend/infrastructure/workers/outbox-worker.js';
import {
  ProvisioningEventDispatcher,
  SqliteProvisioningEventWorkRepository,
} from '../../../backend/infrastructure/workers/provisioning-event-dispatcher.js';
import { WorkerHost } from '../../../backend/infrastructure/workers/worker-host.js';
import { WorkerRole } from '../../../backend/infrastructure/workers/worker-role.js';

class StubProvisioningActionAdapter implements ProvisioningActionAdapter {
  public constructor(
    public readonly type: string,
    private readonly result: ProvisioningActionResult,
  ) {}

  public async execute(_input: ProvisioningActionInput): Promise<ProvisioningActionResult> {
    return this.result;
  }
}

class FlakyPublisher {
  public readonly received: ProvisioningEventEnvelope[] = [];
  private remainingFailures: number;

  public constructor(failuresBeforeSuccess: number) {
    this.remainingFailures = failuresBeforeSuccess;
  }

  public async publish(event: ProvisioningEventEnvelope): Promise<void> {
    if (this.remainingFailures > 0) {
      this.remainingFailures -= 1;
      throw new Error('consumer temporarily unavailable');
    }
    this.received.push(event);
  }
}

describe('Provisioning Event Dispatcher SQLite integration', () => {
  let directory: string;
  let database: SqliteDatabase;
  let companyId: string;
  let idGenerator: UuidV7IdGenerator;
  let requestRepo: SqliteProvisioningRequestRepository;
  let attemptRepo: SqliteProvisioningAttemptRepository;
  let outbox: SqliteOutboxRepository;
  let now: Date;
  let clock: { now: () => Date };

  beforeEach(async () => {
    directory = mkdtempSync(join(tmpdir(), 'cuzonet-provisioning-dispatcher-'));
    database = new SqliteDatabase({ busyTimeoutMs: 2_500, path: join(directory, 'test.sqlite') });
    now = new Date('2026-07-20T12:00:00.000Z');
    clock = { now: () => now };
    new MigrationRunner(database.connection, clock).migrate();
    idGenerator = new UuidV7IdGenerator();
    companyId = await new CompanyBootstrap(database.session, idGenerator).bootstrap(
      {
        currencyCode: 'GTQ',
        displayName: 'CuzoNet',
        legalName: 'CuzoNet',
        timezone: 'America/Guatemala',
      },
      now,
    );
    requestRepo = new SqliteProvisioningRequestRepository(database.session);
    attemptRepo = new SqliteProvisioningAttemptRepository(database.session);
    outbox = new SqliteOutboxRepository(database.session);
  });

  afterEach(async () => {
    await database.close();
    rmSync(directory, { force: true, maxRetries: 5, recursive: true, retryDelay: 100 });
  });

  async function createSucceededRequestEvent(idempotencyKey: string): Promise<string> {
    const requestProvisioning = new RequestProvisioning(
      requestRepo,
      { getCompanyId: () => companyId },
      idGenerator,
      outbox,
      clock,
      5,
    );
    const dispatch = new DispatchProvisioningRequest(
      requestRepo,
      attemptRepo,
      new Map([['routeros.simple_queue.create', new StubProvisioningActionAdapter('routeros.simple_queue.create', { outcome: 'success' })]]),
      idGenerator,
      clock,
      new ProvisioningRetryPolicy(5),
      outbox,
    );

    const created = await requestProvisioning.execute({
      actionType: 'routeros.simple_queue.create',
      idempotencyKey,
      inputSnapshotJson: JSON.stringify({ routerId: 'router-1' }),
      targetId: 'target-1',
      targetType: 'simple-queue',
    });
    await requestRepo.claimDue(10, 'worker-1', now);
    await dispatch.execute({ requestId: created.id, workerId: 'worker-1' });
    return created.id;
  }

  function buildHost(publisher: { publish(event: ProvisioningEventEnvelope): Promise<void> }): WorkerHost {
    return new WorkerHost(
      [
        new OutboxWorker(new SqliteOutboxWorkRepository(database.session), clock),
        new ProvisioningEventDispatcher(new SqliteProvisioningEventWorkRepository(database.session), publisher, clock),
      ],
      new SqliteWorkLeaseRepository(database.session),
      new SqliteWorkerStatisticsRepository(database.session),
      'dispatcher-test-worker',
      {},
      clock,
    );
  }

  it('fans out an outbox event and delivers it to the publisher', async () => {
    const requestId = await createSucceededRequestEvent('dispatcher-1');
    const publisher = new InMemoryProvisioningEventPublisher();
    const host = buildHost(publisher);

    await expect(host.runOnce(WorkerRole.Outbox)).resolves.toEqual({ outcome: 'processed' });
    await expect(host.runOnce(WorkerRole.Outbox)).resolves.toEqual({ outcome: 'processed' }); // Requested + Succeeded

    await expect(host.runOnce(WorkerRole.ProvisioningEventDispatch)).resolves.toEqual({ outcome: 'processed' });
    await expect(host.runOnce(WorkerRole.ProvisioningEventDispatch)).resolves.toEqual({ outcome: 'processed' });

    const eventTypes = publisher.events().map((event) => event.eventType).sort();
    expect(eventTypes).toEqual(['ProvisioningRequested.v1', 'ProvisioningSucceeded.v1']);
    for (const event of publisher.events()) {
      expect(event.payload.requestId).toBe(requestId);
      expect(event.companyId).toBe(companyId);
    }

    const deliveries = database.connection
      .prepare("SELECT status FROM event_deliveries WHERE consumer_name = 'provisioning-events'")
      .all() as { status: string }[];
    expect(deliveries.every((row) => row.status === 'processed')).toBe(true);
  });

  it('is idempotent: an already-processed delivery is never dispatched again', async () => {
    await createSucceededRequestEvent('dispatcher-idempotent');
    const publisher = new InMemoryProvisioningEventPublisher();
    const host = buildHost(publisher);

    await host.runOnce(WorkerRole.Outbox);
    await host.runOnce(WorkerRole.Outbox);
    await host.runOnce(WorkerRole.ProvisioningEventDispatch);
    await host.runOnce(WorkerRole.ProvisioningEventDispatch);
    const countAfterFirstPass = publisher.events().length;

    // Nothing left to dispatch: the next run must be idle, not a re-delivery.
    await expect(host.runOnce(WorkerRole.ProvisioningEventDispatch)).resolves.toEqual({ outcome: 'idle' });
    expect(publisher.events()).toHaveLength(countAfterFirstPass);
  });

  it('retries a temporary publish failure and eventually delivers the event', async () => {
    await createSucceededRequestEvent('dispatcher-retry');
    const flaky = new FlakyPublisher(1);
    const host = buildHost(flaky);

    await host.runOnce(WorkerRole.Outbox);
    await host.runOnce(WorkerRole.Outbox); // fan out both events

    const firstAttempt = await host.runOnce(WorkerRole.ProvisioningEventDispatch);
    expect(firstAttempt.outcome).toBe('retried');
    expect(flaky.received).toHaveLength(0);

    const pendingRetry = database.connection
      .prepare("SELECT status, next_attempt_at FROM event_deliveries WHERE consumer_name = 'provisioning-events' AND status = 'failed'")
      .get() as { next_attempt_at: string; status: string };
    expect(pendingRetry.status).toBe('failed');
    expect(pendingRetry.next_attempt_at).not.toBeNull();

    // Advance the clock past next_attempt_at so the retry becomes due.
    now = new Date(new Date(pendingRetry.next_attempt_at).getTime() + 1);

    const secondAttempt = await host.runOnce(WorkerRole.ProvisioningEventDispatch);
    expect(secondAttempt.outcome).toBe('processed');
    expect(flaky.received.length).toBeGreaterThan(0);
  });
});
