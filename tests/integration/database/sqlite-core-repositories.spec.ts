import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { ActorContext } from '../../../backend/application/ports/provisioning/actor-context.port.js';
import { CreateClient } from '../../../backend/application/use-cases/clients/create-client/create-client.use-case.js';
import { RequestProvisioningOperation } from '../../../backend/application/use-cases/provisioning/request-provisioning-operation/request-provisioning-operation.use-case.js';
import { CreateService } from '../../../backend/application/use-cases/services/create-service/create-service.use-case.js';
import { SqliteClientRepository } from '../../../backend/infrastructure/database/clients/sqlite/sqlite-client-repository.js';
import { SqliteIdempotencyRepository } from '../../../backend/infrastructure/database/idempotency/sqlite/sqlite-idempotency-repository.js';
import { SqliteProvisioningOperationRepository } from '../../../backend/infrastructure/database/provisioning/sqlite/sqlite-provisioning-operation-repository.js';
import { SqliteServiceRepository } from '../../../backend/infrastructure/database/services/sqlite/sqlite-service-repository.js';
import { CompanyBootstrap } from '../../../backend/infrastructure/database/sqlite/bootstrap/company-bootstrap.js';
import { MigrationRunner } from '../../../backend/infrastructure/database/sqlite/migration/migration-runner.js';
import { SqliteDatabase } from '../../../backend/infrastructure/database/sqlite/sqlite-database.js';
import { SqliteUnitOfWork } from '../../../backend/infrastructure/database/sqlite/sqlite-unit-of-work.js';
import { SqliteOutboxRepository } from '../../../backend/infrastructure/events/sqlite/sqlite-outbox-repository.js';
import { UuidV7IdGenerator } from '../../../backend/infrastructure/identity/uuid-v7-id-generator.js';
import { ExponentialRetryPolicy } from '../../../backend/infrastructure/provisioning/retry/exponential-retry-policy.js';
import { ServiceReaderProvisioningAdapter } from '../../../backend/infrastructure/provisioning/services/service-reader-provisioning.adapter.js';

const now = new Date('2026-07-12T12:00:00.000Z');
const clock = { now: () => now };

describe('SQLite core repository integration', () => {
  let directory: string;
  let database: SqliteDatabase;
  let companyId: string;
  let idGenerator: UuidV7IdGenerator;

  beforeEach(async () => {
    directory = mkdtempSync(join(tmpdir(), 'cuzonet-sqlite-'));
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
  });

  afterEach(async () => {
    await database.close();
    rmSync(directory, { force: true, maxRetries: 5, recursive: true, retryDelay: 100 });
  });

  it('persiste Clients y Services con sus eventos en un único outbox', async () => {
    const unitOfWork = new SqliteUnitOfWork(database.session);
    const outbox = new SqliteOutboxRepository(database.session);
    const clients = new SqliteClientRepository(database.session, idGenerator);
    const services = new SqliteServiceRepository(database.session);
    const companyContext = { getCompanyId: () => companyId };
    const createdClient = await new CreateClient(
      clients,
      companyContext,
      idGenerator,
      clock,
      outbox,
      unitOfWork,
    ).execute({
      addresses: [
        {
          addressLine: 'Zona 1, Guatemala',
          isServiceAddress: true,
          label: 'Casa',
        },
      ],
      causationId: 'create-client-1',
      clientType: 'person',
      contacts: [{ isPrimary: true, type: 'phone', value: '+502 5555 0101' }],
      correlationId: 'correlation-client-1',
      documentNumber: '1234567890101',
      documentType: 'dpi',
      legalName: 'Ana López',
      note: 'Cliente de prueba',
    });
    const createdService = await new CreateService(
      services,
      clients,
      companyContext,
      idGenerator,
      clock,
      outbox,
      unitOfWork,
    ).execute({
      billingDay: 15,
      causationId: 'create-service-1',
      clientId: createdClient.client.id,
      correlationId: 'correlation-service-1',
      planVersionId: '01890f2e-7b2a-7cc0-8b9a-7e6b4f3a2c22',
      serviceType: 'simple_queue',
    });

    const rehydratedClient = await clients.findById(companyId, createdClient.client.id);
    const rehydratedService = await services.findById(companyId, createdService.service.id);
    const events = database.connection
      .prepare('SELECT event_type FROM outbox_events ORDER BY occurred_at, event_type')
      .all() as { event_type: string }[];

    expect(rehydratedClient?.contacts[0]?.normalizedValue).toBe('+50255550101');
    expect(rehydratedClient?.addresses[0]?.label).toBe('Casa');
    expect(rehydratedClient?.note?.value).toBe('Cliente de prueba');
    expect(rehydratedService?.lifecycleStatus.value).toBe('pending');
    expect(rehydratedService?.createdAt.toISOString()).toBe(now.toISOString());
    expect(events.map(({ event_type }) => event_type).sort()).toEqual([
      'ClientCreated.v1',
      'ServiceCreated.v1',
    ]);
  });

  it('persiste Provisioning de forma idempotente y agrega su evento al mismo outbox', async () => {
    const unitOfWork = new SqliteUnitOfWork(database.session);
    const outbox = new SqliteOutboxRepository(database.session);
    const clients = new SqliteClientRepository(database.session, idGenerator);
    const services = new SqliteServiceRepository(database.session);
    const provisioning = new SqliteProvisioningOperationRepository(database.session);
    const companyContext = { getCompanyId: () => companyId };
    const client = await new CreateClient(
      clients,
      companyContext,
      idGenerator,
      clock,
      outbox,
      unitOfWork,
    ).execute({
      causationId: 'create-client-2',
      clientType: 'person',
      correlationId: 'correlation-client-2',
      documentNumber: '1234567890102',
      documentType: 'dpi',
      legalName: 'Bruno Díaz',
    });
    const service = await new CreateService(
      services,
      clients,
      companyContext,
      idGenerator,
      clock,
      outbox,
      unitOfWork,
    ).execute({
      billingDay: 10,
      causationId: 'create-service-2',
      clientId: client.client.id,
      correlationId: 'correlation-service-2',
      planVersionId: '01890f2e-7b2a-7cc0-8b9a-7e6b4f3a2c22',
      serviceType: 'simple_queue',
    });
    const actorContext: ActorContext = { getActorId: () => 'actor-one' };
    const request = new RequestProvisioningOperation(
      provisioning,
      provisioning,
      new ServiceReaderProvisioningAdapter(services),
      outbox,
      unitOfWork,
      companyContext,
      actorContext,
      idGenerator,
      clock,
      new ExponentialRetryPolicy(3),
    );
    const input = {
      causationId: 'provision-1',
      correlationId: 'correlation-provision-1',
      idempotencyKey: 'provision-1',
      routerId: '01890f2e-7b2a-7cc0-8b9a-7e6b4f3a2c40',
      serviceId: service.service.id,
      type: 'provision' as const,
    };

    const first = await request.execute(input);
    const repeated = await request.execute(input);
    const rehydrated = await provisioning.findById(companyId, first.operationId);
    const eventCount = database.connection
      .prepare("SELECT COUNT(*) AS total FROM outbox_events WHERE event_type = ?")
      .get('ProvisioningOperationQueued.v1') as { total: number };

    expect(repeated).toEqual(first);
    expect(rehydrated).toMatchObject({ attemptCount: 0, maxAttempts: 3, serviceId: input.serviceId });
    expect(rehydrated?.provisionRequest.routerId).toBe(input.routerId);
    expect(eventCount.total).toBe(1);
  });

  it('guarda y actualiza claves de idempotencia persistentes', async () => {
    const repository = new SqliteIdempotencyRepository(database.session);
    const processing = {
      apiClientId: 'api-client-one',
      createdAt: now.toISOString(),
      expiresAt: '2026-07-13T12:00:00.000Z',
      id: idGenerator.generate(),
      key: 'payment-1',
      requestHash: 'sha256:request',
      requestMethod: 'POST',
      requestPath: '/pagos',
      status: 'processing' as const,
    };
    await repository.save(processing);
    await repository.save({
      ...processing,
      completedAt: '2026-07-12T12:00:01.000Z',
      responseBody: '{"paymentId":"one"}',
      responseStatus: 201,
      status: 'completed',
    });

    await expect(
      repository.find('api-client-one', 'POST', '/pagos', 'payment-1'),
    ).resolves.toMatchObject({ responseStatus: 201, status: 'completed' });
    await expect(repository.find('api-client-two', 'POST', '/pagos', 'payment-1')).resolves.toBeNull();
  });
});
