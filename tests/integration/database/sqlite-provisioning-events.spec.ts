import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type {
  ProvisioningActionAdapter,
  ProvisioningActionInput,
  ProvisioningActionResult,
} from '../../../backend/application/ports/provisioning/provisioning-action-adapter.port.js';
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

const now = new Date('2026-07-20T12:00:00.000Z');
const clock = { now: () => now };

class StubProvisioningActionAdapter implements ProvisioningActionAdapter {
  public constructor(
    public readonly type: string,
    private readonly result: ProvisioningActionResult,
  ) {}

  public async execute(_input: ProvisioningActionInput): Promise<ProvisioningActionResult> {
    return this.result;
  }
}

interface OutboxEventRow {
  event_type: string;
  payload: string;
}

describe('Provisioning Engine SQLite events & outbox integration', () => {
  let directory: string;
  let database: SqliteDatabase;
  let companyId: string;
  let idGenerator: UuidV7IdGenerator;
  let requestRepo: SqliteProvisioningRequestRepository;
  let attemptRepo: SqliteProvisioningAttemptRepository;
  let outbox: SqliteOutboxRepository;
  let requestProvisioning: (adapters: ReadonlyMap<string, ProvisioningActionAdapter>) => {
    request: RequestProvisioning;
    dispatch: DispatchProvisioningRequest;
  };

  beforeEach(async () => {
    directory = mkdtempSync(join(tmpdir(), 'cuzonet-provisioning-events-'));
    database = new SqliteDatabase({ busyTimeoutMs: 2_500, path: join(directory, 'test.sqlite') });
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

    requestProvisioning = (adapters) => ({
      dispatch: new DispatchProvisioningRequest(
        requestRepo,
        attemptRepo,
        adapters,
        idGenerator,
        clock,
        new ProvisioningRetryPolicy(5),
        outbox,
      ),
      request: new RequestProvisioning(
        requestRepo,
        { getCompanyId: () => companyId },
        idGenerator,
        outbox,
        clock,
        5,
      ),
    });
  });

  afterEach(async () => {
    await database.close();
    rmSync(directory, { force: true, maxRetries: 5, recursive: true, retryDelay: 100 });
  });

  function readOutboxEvents(): OutboxEventRow[] {
    return database.connection
      .prepare('SELECT event_type, payload FROM outbox_events ORDER BY occurred_at, event_type')
      .all() as OutboxEventRow[];
  }

  it('persists ProvisioningRequested when a request is created', async () => {
    const { request } = requestProvisioning(new Map());

    const created = await request.execute({
      actionType: 'routeros.simple_queue.create',
      idempotencyKey: 'events-requested-1',
      inputSnapshotJson: JSON.stringify({ routerId: 'router-1' }),
      targetId: 'target-1',
      targetType: 'simple-queue',
    });

    const events = readOutboxEvents();
    expect(events.map((e) => e.event_type)).toEqual(['ProvisioningRequested.v1']);
    const payload = JSON.parse(events[0]!.payload) as Record<string, unknown>;
    expect(payload).toMatchObject({
      action: 'create',
      actionType: 'routeros.simple_queue.create',
      attemptNumber: 0,
      companyId,
      requestId: created.id,
      resourceType: 'routeros.simple_queue',
      routerId: 'router-1',
    });
  });

  it('is idempotent: resubmitting the same idempotencyKey does not publish a second Requested event', async () => {
    const { request } = requestProvisioning(new Map());
    const input = {
      actionType: 'routeros.simple_queue.create',
      idempotencyKey: 'events-requested-idempotent',
      inputSnapshotJson: JSON.stringify({ routerId: 'router-1' }),
      targetId: 'target-1',
      targetType: 'simple-queue',
    };

    await request.execute(input);
    await request.execute(input); // Same idempotencyKey and payload

    const events = readOutboxEvents();
    expect(events.map((e) => e.event_type)).toEqual(['ProvisioningRequested.v1']);
  });

  it('never persists the same event id twice (outbox-level idempotency)', async () => {
    const { request } = requestProvisioning(new Map());
    const created = await request.execute({
      actionType: 'routeros.simple_queue.create',
      idempotencyKey: 'events-outbox-dedup',
      inputSnapshotJson: JSON.stringify({ routerId: 'router-1' }),
      targetId: 'target-1',
      targetType: 'simple-queue',
    });

    const [firstEvent] = readOutboxEvents();
    expect(firstEvent).toBeDefined();

    // Re-append the exact same persisted event id directly through the shared Outbox.
    await outbox.append([
      {
        aggregateId: created.id,
        aggregateType: 'ProvisioningRequest',
        causationId: created.id,
        correlationId: created.id,
        eventId: (database.connection.prepare('SELECT id FROM outbox_events LIMIT 1').get() as { id: string }).id,
        eventType: 'ProvisioningRequested.v1',
        occurredAt: now.toISOString(),
        payload: { action: 'create', actionType: 'x', attemptNumber: 0, companyId, requestId: created.id, resourceType: 'x' },
        schemaVersion: 1,
      },
    ]);

    const events = readOutboxEvents();
    expect(events).toHaveLength(1); // The duplicate id was ignored, not appended twice
  });

  it('persists ProvisioningSucceeded when the adapter reports success', async () => {
    const { request, dispatch } = requestProvisioning(
      new Map([['routeros.simple_queue.create', new StubProvisioningActionAdapter('routeros.simple_queue.create', { outcome: 'success' })]]),
    );

    const created = await request.execute({
      actionType: 'routeros.simple_queue.create',
      idempotencyKey: 'events-success-1',
      inputSnapshotJson: JSON.stringify({ routerId: 'router-1' }),
      targetId: 'target-1',
      targetType: 'simple-queue',
    });

    await requestRepo.claimDue(10, 'worker-1', now);
    await dispatch.execute({ requestId: created.id, workerId: 'worker-1' });

    const events = readOutboxEvents();
    expect(events.map((e) => e.event_type)).toEqual(['ProvisioningRequested.v1', 'ProvisioningSucceeded.v1']);
    const succeededPayload = JSON.parse(events[1]!.payload) as Record<string, unknown>;
    expect(succeededPayload).toMatchObject({ attemptNumber: 1, requestId: created.id, routerId: 'router-1' });
    expect(succeededPayload).not.toHaveProperty('errorCode');
  });

  it('persists ProvisioningFailed (permanent) when the adapter reports permanentFailure', async () => {
    const { request, dispatch } = requestProvisioning(
      new Map([
        [
          'routeros.simple_queue.create',
          new StubProvisioningActionAdapter('routeros.simple_queue.create', {
            errorCode: 'ROUTEROS_CONFLICT',
            errorMessage: 'conflict',
            outcome: 'permanentFailure',
          }),
        ],
      ]),
    );

    const created = await request.execute({
      actionType: 'routeros.simple_queue.create',
      idempotencyKey: 'events-failed-permanent-1',
      inputSnapshotJson: JSON.stringify({ routerId: 'router-1' }),
      targetId: 'target-1',
      targetType: 'simple-queue',
    });

    await requestRepo.claimDue(10, 'worker-1', now);
    await dispatch.execute({ requestId: created.id, workerId: 'worker-1' });

    const events = readOutboxEvents();
    expect(events.map((e) => e.event_type)).toEqual(['ProvisioningFailed.v1', 'ProvisioningRequested.v1']);
    const failedEvent = events.find((e) => e.event_type === 'ProvisioningFailed.v1')!;
    const payload = JSON.parse(failedEvent.payload) as Record<string, unknown>;
    expect(payload).toMatchObject({ errorCode: 'ROUTEROS_CONFLICT', failureType: 'permanent', requestId: created.id });
  });

  it('persists ProvisioningFailed (temporary) and ProvisioningRetryScheduled when a retry is scheduled', async () => {
    const { request, dispatch } = requestProvisioning(
      new Map([
        [
          'routeros.simple_queue.create',
          new StubProvisioningActionAdapter('routeros.simple_queue.create', {
            errorCode: 'ROUTEROS_CONNECTION_FAILED',
            errorMessage: 'temporary',
            outcome: 'temporaryFailure',
          }),
        ],
      ]),
    );

    const created = await request.execute({
      actionType: 'routeros.simple_queue.create',
      idempotencyKey: 'events-retry-1',
      inputSnapshotJson: JSON.stringify({ routerId: 'router-1' }),
      targetId: 'target-1',
      targetType: 'simple-queue',
    });

    await requestRepo.claimDue(10, 'worker-1', now);
    await dispatch.execute({ requestId: created.id, workerId: 'worker-1' });

    const events = readOutboxEvents();
    expect(events.map((e) => e.event_type).sort()).toEqual(
      ['ProvisioningFailed.v1', 'ProvisioningRequested.v1', 'ProvisioningRetryScheduled.v1'].sort(),
    );
    const failedEvent = events.find((e) => e.event_type === 'ProvisioningFailed.v1')!;
    expect(JSON.parse(failedEvent.payload)).toMatchObject({ failureType: 'temporary' });
  });

  it('never includes secrets in any published event payload', async () => {
    const { request, dispatch } = requestProvisioning(
      new Map([['routeros.hotspot.user.create', new StubProvisioningActionAdapter('routeros.hotspot.user.create', { outcome: 'success' })]]),
    );

    const created = await request.execute({
      actionType: 'routeros.hotspot.user.create',
      idempotencyKey: 'events-no-secrets',
      inputSnapshotJson: JSON.stringify({
        credentialReference: 'cred-1',
        name: 'cliente-1',
        profile: 'default',
        routerId: 'router-1',
      }),
      targetId: 'cliente-1',
      targetType: 'hotspot-user',
    });

    await requestRepo.claimDue(10, 'worker-1', now);
    await dispatch.execute({ requestId: created.id, workerId: 'worker-1' });

    const events = readOutboxEvents();
    for (const event of events) {
      const forbidden = ['password', 'credentialreference', 'token', 'secretreference', 'routersecret'];
      const serialized = event.payload.toLowerCase();
      for (const term of forbidden) {
        expect(serialized).not.toContain(term);
      }
    }
  });
});
