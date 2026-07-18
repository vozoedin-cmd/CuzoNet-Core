import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DashboardController } from '../../../backend/api/dashboard/dashboard.controller.js';
import { createDashboardRouter } from '../../../backend/api/dashboard/dashboard.routes.js';
import { createApp } from '../../../backend/api/http/app.js';
import type { Clock } from '../../../backend/application/ports/clock.port.js';
import type { CompanyContext } from '../../../backend/application/ports/company-context.port.js';
import { GetBillingSummaryQuery } from '../../../backend/application/queries/dashboard/get-billing-summary.query.js';
import { GetDashboardOverviewQuery } from '../../../backend/application/queries/dashboard/get-dashboard-overview.query.js';
import { GetNetworkHealthQuery } from '../../../backend/application/queries/dashboard/get-network-health.query.js';
import { InMemoryDashboardCache } from '../../../backend/infrastructure/dashboard/in-memory-dashboard.cache.js';
import { SqliteDashboardReaders } from '../../../backend/infrastructure/dashboard/sqlite-dashboard.readers.js';
import { CompanyBootstrap } from '../../../backend/infrastructure/database/sqlite/bootstrap/company-bootstrap.js';
import { MigrationRunner } from '../../../backend/infrastructure/database/sqlite/migration/migration-runner.js';
import { SqliteDatabase } from '../../../backend/infrastructure/database/sqlite/sqlite-database.js';
import { UuidV7IdGenerator } from '../../../backend/infrastructure/identity/uuid-v7-id-generator.js';

const now = new Date('2026-07-15T12:00:00.000Z');
const clock: Clock = { now: () => now };
const correlationId = '5c2cb32f-3bc5-4b24-9a2d-a79dc0608e5f';

describe('Dashboard API integration', () => {
  let app: ReturnType<typeof createApp>;
  let database: SqliteDatabase;
  let readers: SqliteDashboardReaders;

  beforeEach(async () => {
    database = new SqliteDatabase({ busyTimeoutMs: 1_000, path: ':memory:' });
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
      now,
    );
    const companyContext: CompanyContext = { getCompanyId: () => companyId };
    readers = new SqliteDashboardReaders(database.connection, clock);
    const cache = new InMemoryDashboardCache();
    const controller = new DashboardController({
      billingSummary: new GetBillingSummaryQuery(readers, cache),
      companyContext,
      networkHealth: new GetNetworkHealthQuery(readers, cache),
      overview: new GetDashboardOverviewQuery(
        readers,
        readers,
        readers,
        readers,
        cache,
      ),
    });
    app = createApp({ dashboardRouter: createDashboardRouter(controller) });
  });

  afterEach(async () => {
    await database.close();
  });

  it('expone los tres DTOs exactos bajo /api/v1 y devuelve ceros reales sin datos', async () => {
    const overview = await request(app)
      .get('/api/v1/dashboard/overview')
      .set('X-Correlation-Id', correlationId)
      .expect(200);
    expect(overview.headers['x-correlation-id']).toBe(correlationId);
    expect(overview.body).toEqual({
      activeCriticalAlerts: 0,
      downNetworkNodes: 0,
      monthlyExpectedRevenueCents: 0,
      totalActiveClients: 0,
      totalActiveServices: 0,
    });

    const billing = await request(app)
      .get('/api/v1/dashboard/billing-summary')
      .set('X-Correlation-Id', correlationId)
      .expect(200);
    expect(billing.headers['x-correlation-id']).toBe(correlationId);
    expect(billing.body).toEqual({
      collectedThisMonthCents: 0,
      collectionRatePercentage: 0,
      overdueThisMonthCents: 0,
      unpaidInvoicesCount: 0,
    });

    const network = await request(app)
      .get('/api/v1/dashboard/network-health')
      .set('X-Correlation-Id', correlationId)
      .expect(200);
    expect(network.headers['x-correlation-id']).toBe(correlationId);
    expect(network.body).toEqual({
      criticalLinks: [],
      equipmentsDown: 0,
      equipmentsWarning: 0,
      totalEquipments: 0,
    });
  });

  it('no expone las rutas Dashboard fuera del prefijo global', async () => {
    await request(app).get('/dashboard/overview').expect(404);
    await request(app).get('/dashboard/billing-summary').expect(404);
    await request(app).get('/dashboard/network-health').expect(404);
  });

  it('propaga errores críticos de readers mediante el ApiError global', async () => {
    vi.spyOn(readers, 'getTotalActiveClients').mockRejectedValueOnce(
      new Error('reader unavailable'),
    );

    const response = await request(app)
      .get('/api/v1/dashboard/overview')
      .set('X-Correlation-Id', correlationId)
      .expect(500);

    expect(response.headers['x-correlation-id']).toBe(correlationId);
    expect(response.body).toEqual({
      code: 'INTERNAL_SERVER_ERROR',
      correlationId,
      message: 'Error interno del servidor.',
    });
  });
});
