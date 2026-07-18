import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { EquipmentController } from '../../../backend/api/inventory/equipment.controller.js';
import { createEquipmentRouter } from '../../../backend/api/inventory/equipment.routes.js';
import { createApp } from '../../../backend/api/http/app.js';
import { CreateEquipmentUseCase } from '../../../backend/application/inventory/create-equipment.usecase.js';
import { SetEquipmentManagementHostUseCase } from '../../../backend/application/inventory/set-equipment-management-host.usecase.js';
import type { Clock } from '../../../backend/application/ports/clock.port.js';
import { SqliteEquipmentRepository } from '../../../backend/infrastructure/inventory/sqlite-equipment.repository.js';
import { CompanyBootstrap } from '../../../backend/infrastructure/database/sqlite/bootstrap/company-bootstrap.js';
import { MigrationRunner } from '../../../backend/infrastructure/database/sqlite/migration/migration-runner.js';
import { SqliteDatabase } from '../../../backend/infrastructure/database/sqlite/sqlite-database.js';
import { UuidV7IdGenerator } from '../../../backend/infrastructure/identity/uuid-v7-id-generator.js';

const now = new Date('2026-07-17T12:00:00.000Z');
const clock: Clock = { now: () => now };

describe('Inventory equipment API integration', () => {
  let app: ReturnType<typeof createApp>;
  let companyId: string;
  let database: SqliteDatabase;

  beforeEach(async () => {
    database = new SqliteDatabase({ busyTimeoutMs: 1_000, path: ':memory:' });
    new MigrationRunner(database.connection, clock).migrate();
    const idGenerator = new UuidV7IdGenerator();
    companyId = await new CompanyBootstrap(database.session, idGenerator).bootstrap(
      {
        currencyCode: 'GTQ',
        displayName: 'CuzoNet',
        legalName: 'CuzoNet',
        timezone: 'America/Guatemala',
      },
      now,
    );
    const repository = new SqliteEquipmentRepository(database.connection);
    const controller = new EquipmentController(
      new CreateEquipmentUseCase(repository, idGenerator),
      new SetEquipmentManagementHostUseCase(repository),
    );
    app = createApp({ equipmentRouter: createEquipmentRouter(controller) });
  });

  afterEach(async () => {
    await database.close();
  });

  it('expone POST /api/v1/equipments con el comando real', async () => {
    const response = await request(app)
      .post('/api/v1/equipments')
      .send({
        capabilities: {
          maxThroughputMbps: 1_000,
          supportsHotspot: false,
          supportsPppoe: true,
        },
        companyId,
        macAddress: 'AA:BB:CC:DD:EE:FF',
        role: 'core',
        serialNumber: 'SN-100',
        type: 'router',
      })
      .expect(201);

    expect(response.body).toEqual({ id: expect.any(String) });
    const persisted = database.connection
      .prepare(
        'SELECT company_id, asset_type, role, status, serial_number, mac_address, capabilities FROM network_assets WHERE id = ?',
      )
      .get(response.body.id) as Record<string, unknown>;
    expect(persisted).toMatchObject({
      asset_type: 'router',
      company_id: companyId,
      mac_address: 'AA:BB:CC:DD:EE:FF',
      role: 'core',
      serial_number: 'SN-100',
      status: 'active',
    });
    expect(JSON.parse(persisted.capabilities as string)).toEqual({
      maxThroughputMbps: 1_000,
      supportsHotspot: false,
      supportsPppoe: true,
    });
  });

  it('no expone la ruta fuera del prefijo global', async () => {
    await request(app).post('/equipments').send({}).expect(404);
  });

  it('mantiene el error contractual 400 para comandos inválidos', async () => {
    const response = await request(app)
      .post('/api/v1/equipments')
      .send({
        capabilities: { supportsHotspot: false, supportsPppoe: false },
        companyId,
        role: '',
        type: '',
      })
      .expect(400);

    expect(response.body).toEqual({ error: 'EquipmentType cannot be empty' });
  });
});
