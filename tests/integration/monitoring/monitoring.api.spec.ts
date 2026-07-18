import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createApp } from '../../../backend/api/http/app.js';
import { MonitoringController } from '../../../backend/api/monitoring/monitoring.controller.js';
import { createMonitoringRouter } from '../../../backend/api/monitoring/monitoring.routes.js';
import type { Clock } from '../../../backend/application/ports/clock.port.js';
import { GetLatestStateUseCase } from '../../../backend/application/use-cases/monitoring/get-latest-state.usecase.js';
import { GetTimeSeriesUseCase } from '../../../backend/application/use-cases/monitoring/get-time-series.usecase.js';
import { GetTopologyStateUseCase } from '../../../backend/application/use-cases/monitoring/get-topology-state.usecase.js';
import { RecordObservationBatchUseCase } from '../../../backend/application/use-cases/monitoring/record-observation-batch.usecase.js';
import { CompanyBootstrap } from '../../../backend/infrastructure/database/sqlite/bootstrap/company-bootstrap.js';
import { MigrationRunner } from '../../../backend/infrastructure/database/sqlite/migration/migration-runner.js';
import { SqliteDatabase } from '../../../backend/infrastructure/database/sqlite/sqlite-database.js';
import { UuidV7IdGenerator } from '../../../backend/infrastructure/identity/uuid-v7-id-generator.js';
import { SqliteEquipmentStateRepository } from '../../../backend/infrastructure/monitoring/sqlite-equipment-state.repository.js';
import { SqliteInventoryReaderAdapter } from '../../../backend/infrastructure/monitoring/sqlite-inventory-reader.adapter.js';
import { SqliteNetworkReaderAdapter } from '../../../backend/infrastructure/monitoring/sqlite-network-reader.adapter.js';
import { SqliteObservationRepository } from '../../../backend/infrastructure/monitoring/sqlite-observation.repository.js';

const now = new Date('2026-07-17T12:00:00.000Z');
const clock: Clock = { now: () => now };
const equipmentId = 'equipment-monitoring-1';

describe('Monitoring API integration', () => {
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
      .run(
        equipmentId,
        companyId,
        'router',
        'active',
        now.toISOString(),
        'core',
        '{}',
      );

    const observationRepository = new SqliteObservationRepository(database.connection);
    const stateRepository = new SqliteEquipmentStateRepository(database.connection);
    const inventoryReader = new SqliteInventoryReaderAdapter(database.connection);
    const controller = new MonitoringController(
      new RecordObservationBatchUseCase(
        observationRepository,
        stateRepository,
        inventoryReader,
        idGenerator,
      ),
      new GetLatestStateUseCase(stateRepository, inventoryReader),
      new GetTimeSeriesUseCase(observationRepository, inventoryReader),
      new GetTopologyStateUseCase(
        stateRepository,
        new SqliteNetworkReaderAdapter(database.connection),
      ),
    );
    app = createApp({ monitoringRouter: createMonitoringRouter(controller) });
  });

  afterEach(async () => {
    await database.close();
  });

  it('registra un lote JSON y expone estado y serie temporal bajo /api/v1', async () => {
    await request(app)
      .post('/api/v1/monitoring/batch')
      .send({
        companyId,
        observations: [
          {
            equipmentId,
            metricType: 'ping_latency',
            source: 'integration-test',
            timestamp: now.toISOString(),
            unit: 'ms',
            value: 18,
          },
          {
            equipmentId,
            metricType: 'uptime',
            source: 'integration-test',
            timestamp: now.toISOString(),
            unit: 'seconds',
            value: 3_600,
          },
        ],
      })
      .expect(202, { success: true });

    const state = await request(app)
      .get(`/api/v1/monitoring/equipment/${equipmentId}/state`)
      .query({ companyId })
      .expect(200);
    expect(state.body).toEqual({
      equipmentId,
      lastLatencyMs: 18,
      lastSeenAt: now.toISOString(),
      status: 'UP',
      uptimeSeconds: 3_600,
    });

    const timeSeries = await request(app)
      .get(`/api/v1/monitoring/equipment/${equipmentId}/timeseries`)
      .query({
        companyId,
        from: '2026-07-17T11:00:00.000Z',
        metricType: 'ping_latency',
        to: '2026-07-17T13:00:00.000Z',
      })
      .expect(200);
    expect(timeSeries.body).toEqual([{ timestamp: now.toISOString(), value: 18 }]);
  });

  it('no expone Monitoring fuera del prefijo global', async () => {
    await request(app).post('/monitoring/batch').send({}).expect(404);
    await request(app).get(`/monitoring/equipment/${equipmentId}/state`).expect(404);
  });

  it('rechaza entityType ajeno al contrato de topología', async () => {
    await request(app)
      .get('/api/v1/monitoring/topology/entity-1/state')
      .query({ entityType: 'device' })
      .expect(400, { error: 'entityType must be node or link' });
  });
});
