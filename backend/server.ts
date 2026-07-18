import { createServer } from 'node:http';

import { ClientsController } from './api/clients/controller/clients.controller.js';
import { BillingController } from './api/billing/controller/billing.controller.js';
import { createBillingRouter } from './api/billing/routes/billing.routes.js';
import { createClientsRouter } from './api/clients/routes/clients.routes.js';
import { DashboardController } from './api/dashboard/dashboard.controller.js';
import { createDashboardRouter } from './api/dashboard/dashboard.routes.js';
import { createApp } from './api/http/app.js';
import { ProvisioningController } from './api/provisioning/controller/provisioning.controller.js';
import { createProvisioningRouter } from './api/provisioning/routes/provisioning.routes.js';
import { PlansController } from './api/plans/controller/plans.controller.js';
import { createPlansRouter } from './api/plans/routes/plans.routes.js';
import { ServicesController } from './api/services/controller/services.controller.js';
import { createServicesRouter } from './api/services/routes/services.routes.js';
import { GetBillingSummaryQuery } from './application/queries/dashboard/get-billing-summary.query.js';
import { GetDashboardOverviewQuery } from './application/queries/dashboard/get-dashboard-overview.query.js';
import { GetNetworkHealthQuery } from './application/queries/dashboard/get-network-health.query.js';
import { ArchiveClient } from './application/use-cases/clients/archive-client/archive-client.use-case.js';
import { CreateClient } from './application/use-cases/clients/create-client/create-client.use-case.js';
import { GetClient } from './application/use-cases/clients/get-client/get-client.use-case.js';
import { ListClients } from './application/use-cases/clients/list-clients/list-clients.use-case.js';
import { UpdateClient } from './application/use-cases/clients/update-client/update-client.use-case.js';
import { CreatePlan } from './application/use-cases/plans/create-plan/create-plan.use-case.js';
import { ListPlans } from './application/use-cases/plans/list-plans/list-plans.use-case.js';
import { RevisePlan } from './application/use-cases/plans/revise-plan/revise-plan.use-case.js';
import { CreateService } from './application/use-cases/services/create-service/create-service.use-case.js';
import { GetService } from './application/use-cases/services/get-service/get-service.use-case.js';
import { ListClientServices } from './application/use-cases/services/list-client-services/list-client-services.use-case.js';
import { GetProvisioningOperation } from './application/use-cases/provisioning/get-provisioning-operation/get-provisioning-operation.use-case.js';
import { RequestProvisioningOperation } from './application/use-cases/provisioning/request-provisioning-operation/request-provisioning-operation.use-case.js';
import { GetClientAccountSummary } from './application/use-cases/billing/accounts/get-client-account-summary/get-client-account-summary.use-case.js';
import { ListPayments } from './application/use-cases/billing/payments/list-payments/list-payments.use-case.js';
import { RecordPayment } from './application/use-cases/billing/payments/record-payment/record-payment.use-case.js';
import type { BillingActorContext } from './application/ports/billing/billing-actor-context.port.js';
import type { Clock } from './application/ports/clock.port.js';
import type { CompanyContext } from './application/ports/company-context.port.js';
import type { ActorContext } from './application/ports/provisioning/actor-context.port.js';
import { environment } from './infrastructure/config/environment.js';
import { InMemoryDashboardCache } from './infrastructure/dashboard/in-memory-dashboard.cache.js';
import { SqliteDashboardReaders } from './infrastructure/dashboard/sqlite-dashboard.readers.js';
import { SqliteClientRepository } from './infrastructure/database/clients/sqlite/sqlite-client-repository.js';
import { SqlitePlanRepository } from './infrastructure/database/plans/sqlite/sqlite-plan-repository.js';
import { SqlitePlanReader } from './infrastructure/plans/readers/sqlite-plan-reader.js';
import { SqliteInvoiceRepository } from './infrastructure/database/billing/invoices/sqlite/sqlite-invoice-repository.js';
import { SqlitePaymentRepository } from './infrastructure/database/billing/payments/sqlite/sqlite-payment-repository.js';
import { ClientBillingReaderAdapter } from './infrastructure/billing/clients/client-billing-reader.adapter.js';
import { SqliteCompanyBillingSettings } from './infrastructure/billing/settings/sqlite-company-billing-settings.js';
import { SqliteOutboxRepository } from './infrastructure/events/sqlite/sqlite-outbox-repository.js';
import { SqliteServiceRepository } from './infrastructure/database/services/sqlite/sqlite-service-repository.js';
import { SqliteProvisioningOperationRepository } from './infrastructure/database/provisioning/sqlite/sqlite-provisioning-operation-repository.js';
import { CompanyBootstrap } from './infrastructure/database/sqlite/bootstrap/company-bootstrap.js';
import { DatabaseHealthChecker } from './infrastructure/database/sqlite/database-health-checker.js';
import { MigrationRunner } from './infrastructure/database/sqlite/migration/migration-runner.js';
import { SqliteDatabase } from './infrastructure/database/sqlite/sqlite-database.js';
import { SqliteUnitOfWork } from './infrastructure/database/sqlite/sqlite-unit-of-work.js';
import { UuidV7IdGenerator } from './infrastructure/identity/uuid-v7-id-generator.js';
import { logger } from './infrastructure/logging/logger.js';
import { ExponentialRetryPolicy } from './infrastructure/provisioning/retry/exponential-retry-policy.js';
import { ServiceReaderProvisioningAdapter } from './infrastructure/provisioning/services/service-reader-provisioning.adapter.js';
import { SqliteSingleCompanyContext } from './infrastructure/tenancy/sqlite-single-company-context.js';

const shutdownTimeoutMs = 10_000;
const idGenerator = new UuidV7IdGenerator();
const clock: Clock = {
  now: () => new Date(),
};
const sqlite = new SqliteDatabase({
  busyTimeoutMs: environment.DATABASE_BUSY_TIMEOUT_MS,
  path: environment.DATABASE_PATH,
});
new MigrationRunner(sqlite.connection, clock).migrate();
const companyId = await new CompanyBootstrap(sqlite.session, idGenerator).bootstrap(
  {
    currencyCode: 'GTQ',
    displayName: environment.APP_NAME,
    legalName: environment.APP_NAME,
    timezone: environment.TIMEZONE,
  },
  clock.now(),
);
new DatabaseHealthChecker(sqlite.connection).assertHealthy();
const companyContext: CompanyContext = new SqliteSingleCompanyContext(companyId);
const unitOfWork = new SqliteUnitOfWork(sqlite.session);
const outbox = new SqliteOutboxRepository(sqlite.session);
const clientRepository = new SqliteClientRepository(sqlite.session, idGenerator);
const planRepository = new SqlitePlanRepository(sqlite.session);
const planReader = new SqlitePlanReader(sqlite.session);
const serviceRepository = new SqliteServiceRepository(sqlite.session);
const provisioningRepository = new SqliteProvisioningOperationRepository(sqlite.session);
const provisioningRetryPolicy = new ExponentialRetryPolicy(3);
const billingInvoiceRepository = new SqliteInvoiceRepository(sqlite.session);
const billingPaymentRepository = new SqlitePaymentRepository(sqlite.session);
const billingSettings = new SqliteCompanyBillingSettings(sqlite.session);
const actorContext: ActorContext = { getActorId: () => 'temporary-server-context' };
const billingActorContext: BillingActorContext = { getActorId: () => 'temporary-server-context' };
const dashboardReaders = new SqliteDashboardReaders(sqlite.connection, clock);
const dashboardCache = new InMemoryDashboardCache();
const dashboardController = new DashboardController({
  billingSummary: new GetBillingSummaryQuery(dashboardReaders, dashboardCache),
  companyContext,
  networkHealth: new GetNetworkHealthQuery(dashboardReaders, dashboardCache),
  overview: new GetDashboardOverviewQuery(
    dashboardReaders,
    dashboardReaders,
    dashboardReaders,
    dashboardReaders,
    dashboardCache,
  ),
});
const dashboardRouter = createDashboardRouter(dashboardController);
const clientsController = new ClientsController({
  archiveClient: new ArchiveClient(clientRepository, companyContext, clock),
  createClient: new CreateClient(
    clientRepository,
    companyContext,
    idGenerator,
    clock,
    outbox,
    unitOfWork,
  ),
  getClient: new GetClient(clientRepository, companyContext),
  listClients: new ListClients(clientRepository, companyContext),
  updateClient: new UpdateClient(clientRepository, companyContext, clock),
});
const clientsRouter = createClientsRouter(clientsController);
const clientBillingReader = new ClientBillingReaderAdapter(clientRepository);
const billingController = new BillingController({
  getClientAccountSummary: new GetClientAccountSummary(
    clientBillingReader,
    billingInvoiceRepository,
    billingPaymentRepository,
    billingPaymentRepository,
    billingSettings,
    companyContext,
    clock,
  ),
  listPayments: new ListPayments(billingPaymentRepository, companyContext),
  recordPayment: new RecordPayment(
    billingPaymentRepository,
    billingPaymentRepository,
    billingPaymentRepository,
    billingInvoiceRepository,
    billingPaymentRepository,
    clientBillingReader,
    billingSettings,
    outbox,
    unitOfWork,
    companyContext,
    billingActorContext,
    idGenerator,
    clock,
  ),
});
const billingRouter = createBillingRouter(billingController);
const plansController = new PlansController({
  createPlan: new CreatePlan(
    planRepository,
    companyContext,
    idGenerator,
    clock,
    outbox,
    unitOfWork,
  ),
  listPlans: new ListPlans(planReader, companyContext),
  revisePlan: new RevisePlan(
    planRepository,
    companyContext,
    idGenerator,
    clock,
    outbox,
    unitOfWork,
  ),
});
const plansRouter = createPlansRouter(plansController);
const servicesController = new ServicesController({
  createService: new CreateService(
    serviceRepository,
    clientRepository,
    companyContext,
    idGenerator,
    clock,
    outbox,
    unitOfWork,
  ),
  getService: new GetService(serviceRepository, companyContext),
  listClientServices: new ListClientServices(serviceRepository, companyContext),
});
const servicesRouter = createServicesRouter(servicesController);
const provisioningController = new ProvisioningController({
  getOperation: new GetProvisioningOperation(provisioningRepository, companyContext),
  requestOperation: new RequestProvisioningOperation(
    provisioningRepository,
    provisioningRepository,
    new ServiceReaderProvisioningAdapter(serviceRepository),
    outbox,
    unitOfWork,
    companyContext,
    actorContext,
    idGenerator,
    clock,
    provisioningRetryPolicy,
  ),
});
const provisioningRouter = createProvisioningRouter(provisioningController);
const server = createServer(
  createApp(
    { billingRouter, clientsRouter, dashboardRouter, plansRouter, provisioningRouter, servicesRouter },
    {
      apiPrefix: environment.API_PREFIX,
      corsAllowedOrigins: environment.CORS_ALLOWED_ORIGINS,
    },
  ),
);

let isShuttingDown = false;

function shutdown(signal: NodeJS.Signals): void {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;
  logger.info({ action: 'server.shutdown.started', module: 'server', signal });

  const forceShutdownTimer = setTimeout(() => {
    logger.error({ action: 'server.shutdown.timeout', module: 'server', signal });
    process.exit(1);
  }, shutdownTimeoutMs);

  forceShutdownTimer.unref();

  server.close(async (error) => {
    clearTimeout(forceShutdownTimer);

    if (error !== undefined) {
      logger.error({
        action: 'server.shutdown.failed',
        errorName: error.name,
        module: 'server',
        signal,
      });
      process.exit(1);
    }

    try {
      await sqlite.close();
      logger.info({ action: 'server.shutdown.completed', module: 'server', signal });
      process.exit(0);
    } catch (databaseError) {
      logger.error({
        action: 'server.database.close.failed',
        errorName: databaseError instanceof Error ? databaseError.name : 'UnknownError',
        module: 'server',
        signal,
      });
      process.exit(1);
    }
  });
}

server.on('error', (error) => {
  logger.error({
    action: 'server.error',
    errorCode: 'code' in error ? error.code : undefined,
    errorName: error.name,
    module: 'server',
  });
  process.exitCode = 1;
});

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);

server.listen(environment.PORT, () => {
  logger.info({
    action: 'server.started',
    module: 'server',
    port: environment.PORT,
  });
});
