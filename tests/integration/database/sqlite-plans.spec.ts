import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { Clock } from '../../../backend/application/ports/clock.port.js';
import type { CompanyContext } from '../../../backend/application/ports/company-context.port.js';
import { CreatePlan } from '../../../backend/application/use-cases/plans/create-plan/create-plan.use-case.js';
import { RevisePlan } from '../../../backend/application/use-cases/plans/revise-plan/revise-plan.use-case.js';
import { SqlitePlanRepository } from '../../../backend/infrastructure/database/plans/sqlite/sqlite-plan-repository.js';
import { CompanyBootstrap } from '../../../backend/infrastructure/database/sqlite/bootstrap/company-bootstrap.js';
import { MigrationRunner } from '../../../backend/infrastructure/database/sqlite/migration/migration-runner.js';
import { SqliteDatabase } from '../../../backend/infrastructure/database/sqlite/sqlite-database.js';
import { SqliteUnitOfWork } from '../../../backend/infrastructure/database/sqlite/sqlite-unit-of-work.js';
import { SqliteOutboxRepository } from '../../../backend/infrastructure/events/sqlite/sqlite-outbox-repository.js';
import { UuidV7IdGenerator } from '../../../backend/infrastructure/identity/uuid-v7-id-generator.js';
import { SqlitePlanReader } from '../../../backend/infrastructure/plans/readers/sqlite-plan-reader.js';

const clock: Clock = { now: () => new Date('2026-07-13T12:00:00.000Z') };

describe('SQLite plans integration', () => {
  let database: SqliteDatabase;
  let directory: string;
  let companyContext: CompanyContext;

  beforeEach(async () => {
    directory = mkdtempSync(join(tmpdir(), 'cuzonet-plans-'));
    database = new SqliteDatabase({ busyTimeoutMs: 2_500, path: join(directory, 'test.sqlite') });
    new MigrationRunner(database.connection, clock).migrate();
    const companyId = await new CompanyBootstrap(
      database.session,
      new UuidV7IdGenerator(),
    ).bootstrap(
      {
        currencyCode: 'GTQ',
        displayName: 'CuzoNet',
        legalName: 'CuzoNet',
        timezone: 'America/Guatemala',
      },
      clock.now(),
    );
    companyContext = { getCompanyId: () => companyId };
  });

  afterEach(async () => {
    await database.close();
    rmSync(directory, { force: true, maxRetries: 5, recursive: true, retryDelay: 100 });
  });

  it('persiste versiones inmutables y resuelve el perfil minimo de provisioning', async () => {
    const repository = new SqlitePlanRepository(database.session);
    const reader = new SqlitePlanReader(database.session);
    const idGenerator = new UuidV7IdGenerator();
    const outbox = new SqliteOutboxRepository(database.session);
    const unitOfWork = new SqliteUnitOfWork(database.session);
    const created = await new CreatePlan(
      repository,
      companyContext,
      idGenerator,
      clock,
      outbox,
      unitOfWork,
    ).execute({
      causationId: 'create-plan-0001',
      code: 'HOME_20',
      correlationId: 'correlation-one',
      downloadKbps: 20_000,
      name: 'Hogar 20 Mbps',
      priceCents: 25_000,
      serviceType: 'simple_queue',
      uploadKbps: 10_000,
    });
    const revised = await new RevisePlan(
      repository,
      companyContext,
      idGenerator,
      clock,
      outbox,
      unitOfWork,
    ).execute({
      causationId: 'revise-plan-0001',
      correlationId: 'correlation-two',
      downloadKbps: 30_000,
      effectiveFrom: '2026-08-01',
      planId: created.plan.id,
      priceCents: 30_000,
      uploadKbps: 15_000,
    });

    const hydrated = await repository.findById(companyContext.getCompanyId(), created.plan.id);
    const profile = await reader.findByPlanVersionId(
      companyContext.getCompanyId(),
      revised.plan.currentVersion.id,
    );
    const events = database.connection
      .prepare("SELECT event_type FROM outbox_events WHERE aggregate_type = 'Plan'")
      .all();

    expect(hydrated?.versions.map((version) => version.versionNumber)).toEqual([1, 2]);
    expect(profile).toEqual({
      downloadKbps: 30_000,
      planVersionId: revised.plan.currentVersion.id,
      serviceType: 'simple_queue',
      uploadKbps: 15_000,
    });
    expect(Object.keys(profile ?? {}).sort()).toEqual(
      ['downloadKbps', 'planVersionId', 'serviceType', 'uploadKbps'].sort(),
    );
    expect(events).toHaveLength(2);
  });
});
