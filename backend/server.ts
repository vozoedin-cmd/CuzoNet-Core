import { createServer } from 'node:http';

import { ClientsController } from './api/clients/controller/clients.controller.js';
import { BillingController } from './api/billing/controller/billing.controller.js';
import { createBillingRouter } from './api/billing/routes/billing.routes.js';
import { createClientsRouter } from './api/clients/routes/clients.routes.js';
import { createApp } from './api/http/app.js';
import { ProvisioningController } from './api/provisioning/controller/provisioning.controller.js';
import { createProvisioningRouter } from './api/provisioning/routes/provisioning.routes.js';
import { ServicesController } from './api/services/controller/services.controller.js';
import { createServicesRouter } from './api/services/routes/services.routes.js';
import { ArchiveClient } from './application/use-cases/clients/archive-client/archive-client.use-case.js';
import { CreateClient } from './application/use-cases/clients/create-client/create-client.use-case.js';
import { GetClient } from './application/use-cases/clients/get-client/get-client.use-case.js';
import { ListClients } from './application/use-cases/clients/list-clients/list-clients.use-case.js';
import { UpdateClient } from './application/use-cases/clients/update-client/update-client.use-case.js';
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
import { InMemoryClientRepository } from './infrastructure/database/clients/in-memory/in-memory-client-repository.js';
import { InMemoryBillingUnitOfWork } from './infrastructure/database/billing/in-memory/in-memory-billing-unit-of-work.js';
import { InMemoryInvoiceRepository } from './infrastructure/database/billing/invoices/in-memory/in-memory-invoice-repository.js';
import { InMemoryPaymentRepository } from './infrastructure/database/billing/payments/in-memory/in-memory-payment-repository.js';
import { ClientBillingReaderAdapter } from './infrastructure/billing/clients/client-billing-reader.adapter.js';
import { InMemoryCompanyBillingSettings } from './infrastructure/billing/settings/in-memory-company-billing-settings.js';
import { InMemoryBillingOutbox } from './infrastructure/events/in-memory-billing-outbox.js';
import { InMemoryServiceRepository } from './infrastructure/database/services/in-memory/in-memory-service-repository.js';
import { InMemoryProvisioningOperationRepository } from './infrastructure/database/provisioning/in-memory/in-memory-provisioning-operation-repository.js';
import { InMemoryProvisioningUnitOfWork } from './infrastructure/database/provisioning/in-memory/in-memory-provisioning-unit-of-work.js';
import { InMemoryOutbox } from './infrastructure/events/in-memory-outbox.js';
import { UuidV7IdGenerator } from './infrastructure/identity/uuid-v7-id-generator.js';
import { logger } from './infrastructure/logging/logger.js';
import { ExponentialRetryPolicy } from './infrastructure/provisioning/retry/exponential-retry-policy.js';
import { ServiceReaderProvisioningAdapter } from './infrastructure/provisioning/services/service-reader-provisioning.adapter.js';

const shutdownTimeoutMs = 10_000;
const clientRepository = new InMemoryClientRepository();
const serviceRepository = new InMemoryServiceRepository();
const provisioningRepository = new InMemoryProvisioningOperationRepository();
const provisioningOutbox = new InMemoryOutbox();
const provisioningUnitOfWork = new InMemoryProvisioningUnitOfWork();
const provisioningRetryPolicy = new ExponentialRetryPolicy(3);
const billingInvoiceRepository = new InMemoryInvoiceRepository();
const billingPaymentRepository = new InMemoryPaymentRepository();
const billingOutbox = new InMemoryBillingOutbox();
const billingUnitOfWork = new InMemoryBillingUnitOfWork();
const billingSettings = new InMemoryCompanyBillingSettings();
const idGenerator = new UuidV7IdGenerator();
const temporaryCompanyId = idGenerator.generate();
const companyContext: CompanyContext = {
  getCompanyId: () => temporaryCompanyId,
};
const clock: Clock = {
  now: () => new Date(),
};
const actorContext: ActorContext = { getActorId: () => 'temporary-server-context' };
const billingActorContext: BillingActorContext = { getActorId: () => 'temporary-server-context' };
const clientsController = new ClientsController({
  archiveClient: new ArchiveClient(clientRepository, companyContext, clock),
  createClient: new CreateClient(clientRepository, companyContext, idGenerator, clock),
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
    billingOutbox,
    billingUnitOfWork,
    companyContext,
    billingActorContext,
    idGenerator,
    clock,
  ),
});
const billingRouter = createBillingRouter(billingController);
const servicesController = new ServicesController({
  createService: new CreateService(
    serviceRepository,
    clientRepository,
    companyContext,
    idGenerator,
    clock,
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
    provisioningOutbox,
    provisioningUnitOfWork,
    companyContext,
    actorContext,
    idGenerator,
    clock,
    provisioningRetryPolicy,
  ),
});
const provisioningRouter = createProvisioningRouter(provisioningController);
const server = createServer(
  createApp({ billingRouter, clientsRouter, provisioningRouter, servicesRouter }),
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

  server.close((error) => {
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

    logger.info({ action: 'server.shutdown.completed', module: 'server', signal });
    process.exit(0);
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
