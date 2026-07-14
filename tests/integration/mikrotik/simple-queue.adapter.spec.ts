import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { ProvisioningExecutionCommand } from '../../../backend/application/ports/provisioning/provisioning-executor.port.js';
import { ProvisionRequest } from '../../../backend/domain/provisioning/value-objects/provision-request.js';
import type {
  RouterOsApiClient,
  RouterOsApiSession,
  RouterOsCommand,
  RouterOsConnection,
  RouterOsSentence,
} from '../../../backend/infrastructure/mikrotik/api-ssl/router-os-api.contracts.js';
import {
  RouterOsTransportError,
  UnknownTrap,
} from '../../../backend/infrastructure/mikrotik/api-ssl/router-os-api-errors.js';
import { MikrotikProvisioningExecutorAdapter } from '../../../backend/infrastructure/mikrotik/mikrotik-provisioning-executor.adapter.js';
import { SqliteMikrotikResourceRepository } from '../../../backend/infrastructure/mikrotik/resources/sqlite-mikrotik-resource.repository.js';
import { MigrationRunner } from '../../../backend/infrastructure/database/sqlite/migration/migration-runner.js';
import { SqliteDatabase } from '../../../backend/infrastructure/database/sqlite/sqlite-database.js';

const companyId = '01890f2e-7b2a-7cc0-8b9a-7e6b4f3a2c10';
const clientId = '01890f2e-7b2a-7cc0-8b9a-7e6b4f3a2c20';
const serviceId = '01890f2e-7b2a-7cc0-8b9a-7e6b4f3a2c30';
const routerId = '01890f2e-7b2a-7cc0-8b9a-7e6b4f3a2c40';
const ipAddressId = '01890f2e-7b2a-7cc0-8b9a-7e6b4f3a2c50';
const operationId = '01890f2e-7b2a-7cc0-8b9a-7e6b4f3a2c60';
const resourceId = '01890f2e-7b2a-7cc0-8b9a-7e6b4f3a2c70';
const timestamp = '2026-07-13T12:00:00.000Z';

describe('MikroTik Simple Queue integration', () => {
  let directory: string;
  let database: SqliteDatabase;
  let resources: SqliteMikrotikResourceRepository;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'cuzonet-mikrotik-'));
    database = new SqliteDatabase({ busyTimeoutMs: 2_500, path: join(directory, 'test.sqlite') });
    new MigrationRunner(database.connection).migrate();
    insertService(database);
    resources = new SqliteMikrotikResourceRepository(database.session, {
      generate: () => resourceId,
    });
  });

  afterEach(async () => {
    await database.close();
    rmSync(directory, { force: true, maxRetries: 5, recursive: true, retryDelay: 100 });
  });

  it('no duplica la queue si el router reinicia despues de aplicar el alta', async () => {
    const router = new RestartingRouter();
    const adapter = createAdapter(router);

    await expect(adapter.execute(command())).resolves.toMatchObject({
      errorCode: 'MIKROTIK_TRANSPORT_ERROR',
      outcome: 'failed',
    });
    const pending = database.connection
      .prepare('SELECT id, remote_id, status FROM mikrotik_resources')
      .get();
    expect(pending).toEqual({ id: resourceId, remote_id: null, status: 'pending' });
    expect(router.queues).toHaveLength(1);

    await expect(adapter.execute(command())).resolves.toEqual({ outcome: 'succeeded' });

    expect(router.queues).toHaveLength(1);
    expect(router.queues[0]).toMatchObject({
      comment: `cuzonet:resource:${resourceId}`,
      id: '*1',
      maxLimit: '5000k/20000k',
    });
    expect(
      database.connection
        .prepare(
          'SELECT id, remote_id, status, desired_hash, observed_hash FROM mikrotik_resources',
        )
        .get(),
    ).toMatchObject({
      desired_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
      id: resourceId,
      observed_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
      remote_id: '*1',
      status: 'applied',
    });
  });

  it('devuelve UnknownTrap como fallo permanente', async () => {
    const adapter = createAdapter(new TrapApiClient());

    await expect(adapter.execute(command())).resolves.toEqual({
      errorCode: 'PERMANENT_MIKROTIK_UNKNOWN_TRAP',
      errorMessage: 'trap sin regla',
      outcome: 'failed',
    });
  });

  function createAdapter(apiClient: RouterOsApiClient) {
    return new MikrotikProvisioningExecutorAdapter({
      apiClient,
      clock: { now: () => new Date(timestamp) },
      resources,
      routers: {
        findConnection: () =>
          Promise.resolve({
            host: 'router.test',
            password: 'secret',
            rejectUnauthorized: true,
            username: 'cuzonet',
          }),
      },
      targets: { resolve: () => Promise.resolve('192.0.2.10/32') },
    });
  }
});

interface RemoteQueue {
  comment: string;
  id: string;
  maxLimit: string;
  name: string;
  target: string;
}

class RestartingRouter implements RouterOsApiClient {
  public readonly queues: RemoteQueue[] = [];
  private mustRestart = true;

  public connect(_connection: RouterOsConnection): Promise<RouterOsApiSession> {
    return Promise.resolve({
      close: () => Promise.resolve(),
      execute: (command) => this.execute(command),
    });
  }

  private execute(command: RouterOsCommand): Promise<readonly RouterOsSentence[]> {
    if (command.path === '/system/resource/print') {
      return Promise.resolve(replies({ version: '7.20.1 (stable)' }));
    }
    if (command.path === '/queue/simple/print') {
      const comment = command.queries?.[0]?.replace('?comment=', '');
      const queue = this.queues.find((candidate) => candidate.comment === comment);
      return Promise.resolve(
        queue === undefined
          ? done()
          : [
              {
                attributes: {
                  '.id': queue.id,
                  comment: queue.comment,
                  'max-limit': queue.maxLimit,
                  name: queue.name,
                  target: queue.target,
                },
                type: '!re',
              },
              ...done(),
            ],
      );
    }
    if (command.path === '/queue/simple/add') {
      this.queues.push(queueFrom(command.arguments ?? {}, '*1'));
      if (this.mustRestart) {
        this.mustRestart = false;
        return Promise.reject(
          new RouterOsTransportError('Router reiniciado antes de confirmar la operacion.'),
        );
      }
      return Promise.resolve([{ attributes: { ret: '*1' }, type: '!done' }]);
    }
    if (command.path === '/queue/simple/set') {
      const remoteId = command.arguments?.['.id'];
      const index = this.queues.findIndex((queue) => queue.id === remoteId);
      if (index >= 0) this.queues[index] = queueFrom(command.arguments ?? {}, remoteId ?? '*1');
      return Promise.resolve(done());
    }
    throw new Error(`Comando inesperado: ${command.path}`);
  }
}

class TrapApiClient implements RouterOsApiClient {
  public connect(_connection: RouterOsConnection): Promise<RouterOsApiSession> {
    return Promise.resolve({
      close: () => Promise.resolve(),
      execute: (command) =>
        command.path === '/system/resource/print'
          ? Promise.resolve(replies({ version: '7.20.1' }))
          : Promise.reject(new UnknownTrap('2', 'trap sin regla')),
    });
  }
}

function command(): ProvisioningExecutionCommand {
  return {
    companyId,
    correlationId: operationId,
    downloadKbps: 20_000,
    operationId,
    provisionRequest: ProvisionRequest.create({ ipAddressId, routerId }),
    serviceId,
    uploadKbps: 5_000,
  };
}

function queueFrom(attributes: Readonly<Record<string, string>>, id: string): RemoteQueue {
  return {
    comment: attributes.comment ?? '',
    id,
    maxLimit: attributes['max-limit'] ?? '',
    name: attributes.name ?? '',
    target: attributes.target ?? '',
  };
}

function done(): readonly RouterOsSentence[] {
  return [{ attributes: {}, type: '!done' }];
}

function replies(attributes: Readonly<Record<string, string>>): readonly RouterOsSentence[] {
  return [{ attributes, type: '!re' }, ...done()];
}

function insertService(database: SqliteDatabase): void {
  database.connection
    .prepare(
      `INSERT INTO companies
        (id, legal_name, display_name, timezone, currency_code, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(companyId, 'CuzoNet', 'CuzoNet', 'UTC', 'GTQ', 'active', timestamp);
  database.connection
    .prepare(
      `INSERT INTO clients
        (id, company_id, client_type, document_type, document_number, document_key,
         legal_name, status, created_at, updated_at, archived_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL)`,
    )
    .run(
      clientId,
      companyId,
      'person',
      'dpi',
      '1234567890101',
      'dpi:1234567890101',
      'Cliente',
      'active',
      timestamp,
    );
  database.connection
    .prepare(
      `INSERT INTO client_services
        (id, company_id, client_id, plan_version_id, service_type, lifecycle_status,
         billing_day, created_at, started_on, ended_on)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL)`,
    )
    .run(
      serviceId,
      companyId,
      clientId,
      '01890f2e-7b2a-7cc0-8b9a-7e6b4f3a2c80',
      'simple_queue',
      'pending',
      10,
      timestamp,
    );
}
