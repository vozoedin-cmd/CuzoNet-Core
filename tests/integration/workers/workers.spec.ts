import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { Clock } from '../../../backend/application/ports/clock.port.js';
import { MigrationRunner } from '../../../backend/infrastructure/database/sqlite/migration/migration-runner.js';
import { SqliteDatabase } from '../../../backend/infrastructure/database/sqlite/sqlite-database.js';
import {
  OutboxWorker,
  SqliteOutboxWorkRepository,
} from '../../../backend/infrastructure/workers/outbox-worker.js';
import {
  AutomationWorker,
  SqliteAutomationWorkRepository,
} from '../../../backend/infrastructure/workers/automation-worker.js';
import { RenewWorkLease } from '../../../backend/infrastructure/workers/renew-work-lease.js';
import { SqliteWorkLeaseRepository } from '../../../backend/infrastructure/workers/sqlite/sqlite-work-lease-repository.js';
import { SqliteWorkerStatisticsRepository } from '../../../backend/infrastructure/workers/sqlite/sqlite-worker-statistics-repository.js';
import type {
  WorkerExecutionContext,
  WorkerRoleHandler,
} from '../../../backend/infrastructure/workers/worker-contracts.js';
import { WorkerHost } from '../../../backend/infrastructure/workers/worker-host.js';
import { WorkerRole } from '../../../backend/infrastructure/workers/worker-role.js';

describe('Workers integration', () => {
  let directory: string;
  let primary: SqliteDatabase;
  let secondary: SqliteDatabase;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'cuzonet-workers-'));
    const path = join(directory, 'workers.sqlite');
    primary = new SqliteDatabase({ busyTimeoutMs: 2_500, path });
    new MigrationRunner(primary.connection).migrate();
    secondary = new SqliteDatabase({ busyTimeoutMs: 2_500, path });
  });

  afterEach(async () => {
    await secondary.close();
    await primary.close();
    rmSync(directory, { force: true, maxRetries: 5, recursive: true, retryDelay: 100 });
  });

  it('permite que solo un host procese el mismo trabajo concurrentemente', async () => {
    const now = new Date('2026-07-13T12:00:00.000Z');
    const clock: Clock = { now: () => new Date(now) };
    const firstEntered = deferred<void>();
    const releaseFirst = deferred<void>();
    let executions = 0;
    const handler: WorkerRoleHandler = {
      role: WorkerRole.Automation,
      async runOnce(context: WorkerExecutionContext) {
        const execution = await context.withLease('event-1', async () => {
          executions += 1;
          firstEntered.resolve();
          await releaseFirst.promise;
        });
        return execution.acquired ? { outcome: 'processed' } : { outcome: 'skipped' };
      },
    };
    const firstStatistics = new SqliteWorkerStatisticsRepository(primary.session);
    const secondStatistics = new SqliteWorkerStatisticsRepository(secondary.session);
    await firstStatistics.recordStarted(handler.role, 'host-a', now);
    await secondStatistics.recordStarted(handler.role, 'host-b', now);
    const firstHost = new WorkerHost(
      [handler],
      new SqliteWorkLeaseRepository(primary.session),
      firstStatistics,
      'host-a',
      { leaseDurationMs: 10_000, leaseRenewalMs: 2_000 },
      clock,
    );
    const secondHost = new WorkerHost(
      [handler],
      new SqliteWorkLeaseRepository(secondary.session),
      secondStatistics,
      'host-b',
      { leaseDurationMs: 10_000, leaseRenewalMs: 2_000 },
      clock,
    );

    const firstResult = firstHost.runOnce(handler.role);
    await firstEntered.promise;
    const secondResult = await secondHost.runOnce(handler.role);
    releaseFirst.resolve();

    await expect(firstResult).resolves.toEqual({ outcome: 'processed' });
    expect(secondResult).toEqual({ outcome: 'skipped' });
    expect(executions).toBe(1);
    expect(
      primary.connection
        .prepare('SELECT COUNT(*) AS count FROM work_leases WHERE work_id = ?')
        .get('event-1'),
    ).toEqual({ count: 1 });
  });

  it('renueva el lease y conserva exclusión hasta la nueva expiración', async () => {
    let now = new Date('2026-07-13T12:00:00.000Z');
    const clock: Clock = { now: () => new Date(now) };
    const firstLeases = new SqliteWorkLeaseRepository(primary.session);
    const secondLeases = new SqliteWorkLeaseRepository(secondary.session);
    const lease = await firstLeases.tryAcquire({
      acquiredAt: now,
      durationMs: 1_000,
      ownerId: 'host-a',
      role: WorkerRole.Outbox,
      workId: 'event-1',
    });
    expect(lease).not.toBeNull();

    now = new Date('2026-07-13T12:00:00.500Z');
    const renewed = await new RenewWorkLease(firstLeases, clock).execute(lease!, 1_000);
    expect(renewed.expiresAt.toISOString()).toBe('2026-07-13T12:00:01.500Z');

    const blocked = await secondLeases.tryAcquire({
      acquiredAt: new Date('2026-07-13T12:00:01.200Z'),
      durationMs: 1_000,
      ownerId: 'host-b',
      role: WorkerRole.Outbox,
      workId: 'event-1',
    });
    expect(blocked).toBeNull();

    const acquiredAfterExpiration = await secondLeases.tryAcquire({
      acquiredAt: new Date('2026-07-13T12:00:01.501Z'),
      durationMs: 1_000,
      ownerId: 'host-b',
      role: WorkerRole.Outbox,
      workId: 'event-1',
    });
    expect(acquiredAfterExpiration?.fencingToken).toBe(2);
  });

  it('publica outbox y crea entrega solo para Automation', async () => {
    const timestamp = '2026-07-13T12:00:00.000Z';
    primary.connection
      .prepare(
        `INSERT INTO companies
          (id, legal_name, display_name, timezone, currency_code, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run('company-1', 'CuzoNet', 'CuzoNet', 'UTC', 'GTQ', 'active', timestamp);
    primary.connection
      .prepare(
        `INSERT INTO outbox_events
          (id, company_id, event_type, schema_version, aggregate_type, aggregate_id, payload,
           occurred_at, correlation_id, causation_id, published_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
      )
      .run(
        'event-1',
        'company-1',
        'ClientCreated.v1',
        1,
        'Client',
        'client-1',
        JSON.stringify({ clientId: 'client-1', companyId: 'company-1' }),
        timestamp,
        'correlation-1',
        'causation-1',
      );
    const clock: Clock = { now: () => new Date(timestamp) };
    const statistics = new SqliteWorkerStatisticsRepository(primary.session);
    await statistics.recordStarted(WorkerRole.Outbox, 'host-a', clock.now());
    const host = new WorkerHost(
      [new OutboxWorker(new SqliteOutboxWorkRepository(primary.session), clock)],
      new SqliteWorkLeaseRepository(primary.session),
      statistics,
      'host-a',
      { leaseDurationMs: 10_000, leaseRenewalMs: 2_000 },
      clock,
    );

    await expect(host.runOnce(WorkerRole.Outbox)).resolves.toEqual({ outcome: 'processed' });
    expect(
      primary.connection
        .prepare('SELECT consumer_name, status FROM event_deliveries WHERE event_id = ?')
        .get('event-1'),
    ).toEqual({ consumer_name: 'automation', status: 'pending' });
    expect(
      primary.connection
        .prepare('SELECT published_at FROM outbox_events WHERE id = ?')
        .get('event-1'),
    ).toEqual({ published_at: timestamp });
  });

  it('persiste retry exponencial cuando Automation falla', async () => {
    const timestamp = '2026-07-13T12:00:00.000Z';
    primary.connection
      .prepare(
        `INSERT INTO companies
          (id, legal_name, display_name, timezone, currency_code, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run('company-1', 'CuzoNet', 'CuzoNet', 'UTC', 'GTQ', 'active', timestamp);
    primary.connection
      .prepare(
        `INSERT INTO outbox_events
          (id, company_id, event_type, schema_version, aggregate_type, aggregate_id, payload,
           occurred_at, correlation_id, causation_id, published_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        'event-1',
        'company-1',
        'ClientCreated.v1',
        1,
        'Client',
        'client-1',
        JSON.stringify({ clientId: 'client-1', companyId: 'company-1' }),
        timestamp,
        'correlation-1',
        'causation-1',
        timestamp,
      );
    primary.connection
      .prepare(
        `INSERT INTO event_deliveries
          (id, event_id, consumer_name, status, attempt_count, next_attempt_at, processed_at, last_error)
         VALUES (?, ?, ?, ?, ?, NULL, NULL, NULL)`,
      )
      .run('delivery-1', 'event-1', 'automation', 'pending', 0);
    const clock: Clock = { now: () => new Date(timestamp) };
    const statistics = new SqliteWorkerStatisticsRepository(primary.session);
    await statistics.recordStarted(WorkerRole.Automation, 'host-a', clock.now());
    const host = new WorkerHost(
      [
        new AutomationWorker(
          new SqliteAutomationWorkRepository(primary.session),
          { execute: () => Promise.reject(new Error('temporary failure')) },
          clock,
          { baseRetryDelayMs: 100, maxAttempts: 2 },
        ),
      ],
      new SqliteWorkLeaseRepository(primary.session),
      statistics,
      'host-a',
      { leaseDurationMs: 10_000, leaseRenewalMs: 2_000 },
      clock,
    );

    await expect(host.runOnce(WorkerRole.Automation)).resolves.toEqual({
      error: 'Error: temporary failure',
      outcome: 'retried',
    });
    expect(
      primary.connection
        .prepare('SELECT status, next_attempt_at, last_error FROM event_deliveries WHERE id = ?')
        .get('delivery-1'),
    ).toEqual({
      last_error: 'Error: temporary failure',
      next_attempt_at: '2026-07-13T12:00:00.100Z',
      status: 'failed',
    });
    expect(
      primary.connection
        .prepare(
          'SELECT failed_count, retry_count FROM worker_statistics WHERE role = ? AND worker_id = ?',
        )
        .get(WorkerRole.Automation, 'host-a'),
    ).toEqual({ failed_count: 1, retry_count: 1 });
  });
  it('realiza graceful shutdown abortando y esperando el trabajo activo', async () => {
    const entered = deferred<void>();
    let observedAbort = false;
    const handler: WorkerRoleHandler = {
      role: WorkerRole.Provisioning,
      async runOnce(context) {
        const execution = await context.withLease('operation-1', async (signal) => {
          entered.resolve();
          await new Promise<void>((resolve) => {
            if (signal.aborted) {
              observedAbort = true;
              resolve();
              return;
            }
            signal.addEventListener(
              'abort',
              () => {
                observedAbort = true;
                resolve();
              },
              { once: true },
            );
          });
        });
        return execution.acquired ? { outcome: 'processed' } : { outcome: 'skipped' };
      },
    };
    const statistics = new SqliteWorkerStatisticsRepository(primary.session);
    const host = new WorkerHost(
      [handler],
      new SqliteWorkLeaseRepository(primary.session),
      statistics,
      'host-shutdown',
      {
        idleDelayMs: 10,
        leaseDurationMs: 1_000,
        leaseRenewalMs: 250,
        shutdownTimeoutMs: 1_000,
      },
    );

    await host.start();
    await entered.promise;
    await host.stop();

    expect(observedAbort).toBe(true);
    expect(host.getHealth().status).toBe('stopped');
    expect(
      primary.connection
        .prepare('SELECT stopped_at FROM worker_statistics WHERE role = ? AND worker_id = ?')
        .get(WorkerRole.Provisioning, 'host-shutdown'),
    ).toMatchObject({ stopped_at: expect.any(String) });
  });
});

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
}
