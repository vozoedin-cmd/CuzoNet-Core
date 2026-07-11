import { beforeEach, describe, expect, it } from 'vitest';

import type { Clock } from '../../../../backend/application/ports/clock.port.js';
import type { CompanyContext } from '../../../../backend/application/ports/company-context.port.js';
import { ArchiveClient } from '../../../../backend/application/use-cases/clients/archive-client/archive-client.use-case.js';
import { CreateClient } from '../../../../backend/application/use-cases/clients/create-client/create-client.use-case.js';
import { CreateService } from '../../../../backend/application/use-cases/services/create-service/create-service.use-case.js';
import { GetService } from '../../../../backend/application/use-cases/services/get-service/get-service.use-case.js';
import { ListClientServices } from '../../../../backend/application/use-cases/services/list-client-services/list-client-services.use-case.js';
import { InMemoryClientRepository } from '../../../../backend/infrastructure/database/clients/in-memory/in-memory-client-repository.js';
import { InMemoryServiceRepository } from '../../../../backend/infrastructure/database/services/in-memory/in-memory-service-repository.js';
import { UuidV7IdGenerator } from '../../../../backend/infrastructure/identity/uuid-v7-id-generator.js';

const clock: Clock = { now: () => new Date('2026-07-11T15:00:00.000Z') };
const companyContext: CompanyContext = { getCompanyId: () => 'company-one' };
const planVersionId = '01890f2e-7b2a-7cc0-8b9a-7e6b4f3a2c22';

describe('Services use cases', () => {
  let clientRepository: InMemoryClientRepository;
  let serviceRepository: InMemoryServiceRepository;
  let archiveClient: ArchiveClient;
  let createClient: CreateClient;
  let createService: CreateService;
  let getService: GetService;
  let listClientServices: ListClientServices;

  beforeEach(() => {
    clientRepository = new InMemoryClientRepository();
    serviceRepository = new InMemoryServiceRepository();
    const idGenerator = new UuidV7IdGenerator();
    archiveClient = new ArchiveClient(clientRepository, companyContext, clock);
    createClient = new CreateClient(clientRepository, companyContext, idGenerator, clock);
    createService = new CreateService(
      serviceRepository,
      clientRepository,
      companyContext,
      idGenerator,
      clock,
    );
    getService = new GetService(serviceRepository, companyContext);
    listClientServices = new ListClientServices(serviceRepository, companyContext);
  });

  async function seedClient() {
    return createClient.execute({
      causationId: 'create-client-0001',
      clientType: 'person',
      correlationId: 'correlation-client',
      documentNumber: '1234567890101',
      documentType: 'dpi',
      legalName: 'Ana López',
    });
  }

  async function createForClient(clientId: string) {
    return createService.execute({
      billingDay: 15,
      causationId: 'create-service-0001',
      clientId,
      correlationId: 'correlation-service',
      planVersionId,
      serviceType: 'simple_queue',
    });
  }

  it('CreateService persiste un Service pending y produce solo ServiceCreated.v1', async () => {
    const client = await seedClient();
    const result = await createForClient(client.client.id);

    expect(result.service).toMatchObject({
      clientId: client.client.id,
      lifecycleStatus: 'pending',
      planVersionId,
    });
    expect(result.domainEvents.map((event) => event.eventType)).toEqual(['ServiceCreated.v1']);
  });

  it('CreateService rechaza un cliente inexistente', async () => {
    const missingClientId = '01890f2e-7b2a-7cc0-8b9a-7e6b4f3a2c29';

    await expect(createForClient(missingClientId)).rejects.toMatchObject({
      code: 'RESOURCE_NOT_FOUND',
    });
  });

  it('CreateService rechaza un cliente archivado', async () => {
    const client = await seedClient();
    await archiveClient.execute({ clientId: client.client.id });

    await expect(createForClient(client.client.id)).rejects.toMatchObject({
      code: 'CLIENT_CANNOT_RECEIVE_SERVICE',
    });
  });

  it('GetService obtiene el servicio por empresa e identificador', async () => {
    const client = await seedClient();
    const created = await createForClient(client.client.id);

    await expect(getService.execute({ serviceId: created.service.id })).resolves.toEqual(
      created.service,
    );
  });

  it('ListClientServices lista únicamente los servicios del cliente', async () => {
    const client = await seedClient();
    await createForClient(client.client.id);

    const services = await listClientServices.execute({ clientId: client.client.id });

    expect(services).toHaveLength(1);
    expect(services[0]?.clientId).toBe(client.client.id);
  });
});
