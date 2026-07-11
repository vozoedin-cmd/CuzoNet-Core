import { createServer } from 'node:http';

import { ClientsController } from './api/clients/controller/clients.controller.js';
import { createClientsRouter } from './api/clients/routes/clients.routes.js';
import { createApp } from './api/http/app.js';
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
import type { Clock } from './application/ports/clock.port.js';
import type { CompanyContext } from './application/ports/company-context.port.js';
import { environment } from './infrastructure/config/environment.js';
import { InMemoryClientRepository } from './infrastructure/database/clients/in-memory/in-memory-client-repository.js';
import { InMemoryServiceRepository } from './infrastructure/database/services/in-memory/in-memory-service-repository.js';
import { UuidV7IdGenerator } from './infrastructure/identity/uuid-v7-id-generator.js';
import { logger } from './infrastructure/logging/logger.js';

const shutdownTimeoutMs = 10_000;
const clientRepository = new InMemoryClientRepository();
const serviceRepository = new InMemoryServiceRepository();
const idGenerator = new UuidV7IdGenerator();
const temporaryCompanyId = idGenerator.generate();
const companyContext: CompanyContext = {
  getCompanyId: () => temporaryCompanyId,
};
const clock: Clock = {
  now: () => new Date(),
};
const clientsController = new ClientsController({
  archiveClient: new ArchiveClient(clientRepository, companyContext, clock),
  createClient: new CreateClient(clientRepository, companyContext, idGenerator, clock),
  getClient: new GetClient(clientRepository, companyContext),
  listClients: new ListClients(clientRepository, companyContext),
  updateClient: new UpdateClient(clientRepository, companyContext, clock),
});
const clientsRouter = createClientsRouter(clientsController);
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
const server = createServer(createApp({ clientsRouter, servicesRouter }));

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
