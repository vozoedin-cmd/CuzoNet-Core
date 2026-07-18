import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { EquipmentController } from '../../../backend/api/inventory/equipment.controller.js';
import { createEquipmentRouter } from '../../../backend/api/inventory/equipment.routes.js';
import { createApp } from '../../../backend/api/http/app.js';
import { CreateEquipmentUseCase } from '../../../backend/application/inventory/create-equipment.usecase.js';
import { SetEquipmentManagementHostUseCase } from '../../../backend/application/inventory/set-equipment-management-host.usecase.js';
import type { Clock } from '../../../backend/application/ports/clock.port.js';
import { CompanyBootstrap } from '../../../backend/infrastructure/database/sqlite/bootstrap/company-bootstrap.js';
import { MigrationRunner } from '../../../backend/infrastructure/database/sqlite/migration/migration-runner.js';
import { SqliteDatabase } from '../../../backend/infrastructure/database/sqlite/sqlite-database.js';
import { UuidV7IdGenerator } from '../../../backend/infrastructure/identity/uuid-v7-id-generator.js';
import { SqliteEquipmentRepository } from '../../../backend/infrastructure/inventory/sqlite-equipment.repository.js';

const now = new Date('2026-07-18T12:00:00.000Z');
const clock: Clock = { now: () => now };
const equipmentId = '018f1111-1111-7111-8111-111111111111';
const otherCompanyId = '018f2222-2222-7222-8222-222222222222';

describe('Equipment management host HTTP integration', () => {
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
    database.connection
      .prepare(
        `
          INSERT INTO network_assets (
            id, company_id, asset_type, status, acquired_on, role, capabilities
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
      )
      .run(equipmentId, companyId, 'router', 'active', now.toISOString(), 'core', '{}');
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

  it('asigna el host y conserva el correlationId', async () => {
    await request(app)
      .put(`/api/v1/equipments/${equipmentId}/management-host`)
      .set('X-Correlation-Id', 'management-host-assignment')
      .send({ companyId, managementHost: ' Router.EXAMPLE.COM ' })
      .expect('X-Correlation-Id', 'management-host-assignment')
      .expect(204);

    expect(
      database.connection
        .prepare('SELECT management_host FROM network_assets WHERE id = ?')
        .get(equipmentId),
    ).toEqual({ management_host: 'router.example.com' });
  });

  it('elimina el host usando null', async () => {
    database.connection
      .prepare('UPDATE network_assets SET management_host = ? WHERE id = ?')
      .run('192.0.2.10', equipmentId);

    await request(app)
      .put(`/api/v1/equipments/${equipmentId}/management-host`)
      .send({ companyId, managementHost: null })
      .expect(204);

    expect(
      database.connection
        .prepare('SELECT management_host FROM network_assets WHERE id = ?')
        .get(equipmentId),
    ).toEqual({ management_host: null });
  });

  it('normaliza errores de validación Zod', async () => {
    const response = await request(app)
      .put(`/api/v1/equipments/${equipmentId}/management-host`)
      .set('X-Correlation-Id', 'management-host-zod')
      .send({ companyId, managementHost: 42 })
      .expect(422);

    expect(response.body).toMatchObject({
      code: 'VALIDATION_ERROR',
      correlationId: 'management-host-zod',
      fields: [expect.objectContaining({ path: 'body.managementHost' })],
      message: 'La solicitud contiene datos inválidos.',
    });
  });

  it('aplica tenancy sin revelar equipos de otra compañía', async () => {
    const response = await request(app)
      .put(`/api/v1/equipments/${equipmentId}/management-host`)
      .send({ companyId: otherCompanyId, managementHost: 'router.example.com' })
      .expect(404);

    expect(response.body).toMatchObject({
      code: 'RESOURCE_NOT_FOUND',
      correlationId: expect.any(String),
      message: 'Equipo no encontrado.',
    });
  });

  it('usa el formato global para errores del dominio', async () => {
    const response = await request(app)
      .put(`/api/v1/equipments/${equipmentId}/management-host`)
      .set('X-Correlation-Id', 'management-host-domain')
      .send({ companyId, managementHost: 'https://router.example.com' })
      .expect(422);

    expect(response.body).toEqual({
      code: 'INVALID_EQUIPMENT_DATA',
      correlationId: 'management-host-domain',
      fields: [
        {
          message: 'Debe ser una dirección IP o un hostname sin protocolo, puerto ni path.',
          path: 'managementHost',
        },
      ],
      message: 'Los datos del equipo no son válidos.',
    });
  });
});
