import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';

import { createApp } from '../../../backend/api/http/app.js';
import { ServicesController } from '../../../backend/api/services/controller/services.controller.js';
import { createServicesRouter } from '../../../backend/api/services/routes/services.routes.js';
import type { Clock } from '../../../backend/application/ports/clock.port.js';
import type { CompanyContext } from '../../../backend/application/ports/company-context.port.js';
import { ArchiveClient } from '../../../backend/application/use-cases/clients/archive-client/archive-client.use-case.js';
import { CreateClient } from '../../../backend/application/use-cases/clients/create-client/create-client.use-case.js';
import { CreateService } from '../../../backend/application/use-cases/services/create-service/create-service.use-case.js';
import { GetService } from '../../../backend/application/use-cases/services/get-service/get-service.use-case.js';
import { ListClientServices } from '../../../backend/application/use-cases/services/list-client-services/list-client-services.use-case.js';
import { InMemoryClientRepository } from '../../../backend/infrastructure/database/clients/in-memory/in-memory-client-repository.js';
import { InMemoryServiceRepository } from '../../../backend/infrastructure/database/services/in-memory/in-memory-service-repository.js';
import { UuidV7IdGenerator } from '../../../backend/infrastructure/identity/uuid-v7-id-generator.js';

const clock: Clock = { now: () => new Date('2026-07-11T15:00:00.000Z') };
const companyContext: CompanyContext = { getCompanyId: () => 'company-one' };
const correlationId = '5c2cb32f-3bc5-4b24-9a2d-a79dc0608e5f';
const planVersionId = '01890f2e-7b2a-7cc0-8b9a-7e6b4f3a2c22';

describe('Services API integration', () => {
  let app: ReturnType<typeof createApp>;
  let archiveClient: ArchiveClient;
  let clientId: string;

  beforeEach(async () => {
    const clientRepository = new InMemoryClientRepository();
    const serviceRepository = new InMemoryServiceRepository();
    const idGenerator = new UuidV7IdGenerator();
    const createClient = new CreateClient(clientRepository, companyContext, idGenerator, clock);
    archiveClient = new ArchiveClient(clientRepository, companyContext, clock);
    const client = await createClient.execute({
      causationId: 'create-client-0001',
      clientType: 'person',
      correlationId: 'correlation-client',
      documentNumber: '1234567890101',
      documentType: 'dpi',
      legalName: 'Ana López',
    });
    clientId = client.client.id;

    const controller = new ServicesController({
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
    app = createApp({ servicesRouter: createServicesRouter(controller) });
  });

  function createService() {
    return request(app)
      .post(`/clientes/${clientId}/servicios`)
      .set('Idempotency-Key', 'create-service-0001')
      .set('X-Correlation-Id', correlationId)
      .send({ billingDay: 15, planVersionId, serviceType: 'simple_queue' });
  }

  it('crea, obtiene y lista el Service mediante el contrato separado', async () => {
    const createResponse = await createService().expect(201);

    expect(createResponse.body).toEqual({
      billingDay: 15,
      clientId,
      id: createResponse.body.id,
      lifecycleStatus: 'pending',
      planVersionId,
      serviceType: 'simple_queue',
    });
    expect(createResponse.body.id.slice(14, 15)).toBe('7');
    expect(createResponse.body).not.toHaveProperty('operationId');
    expect(createResponse.body).not.toHaveProperty('routerId');

    await request(app)
      .get(`/servicios/${createResponse.body.id}`)
      .expect(200)
      .expect((response) => expect(response.body).toEqual(createResponse.body));

    await request(app)
      .get(`/clientes/${clientId}/servicios`)
      .expect(200)
      .expect((response) => expect(response.body).toEqual([createResponse.body]));
  });

  it('devuelve 409 mediante el manejador global para un cliente archivado', async () => {
    await archiveClient.execute({ clientId });

    const response = await createService().expect(409);

    expect(response.body).toEqual({
      code: 'CLIENT_CANNOT_RECEIVE_SERVICE',
      correlationId,
      message: 'El cliente no puede recibir nuevos servicios.',
    });
  });

  it('rechaza campos técnicos de Provisioning con 422', async () => {
    const response = await request(app)
      .post(`/clientes/${clientId}/servicios`)
      .set('Idempotency-Key', 'create-service-0001')
      .set('X-Correlation-Id', correlationId)
      .send({
        billingDay: 15,
        planVersionId,
        routerId: '01890f2e-7b2a-7cc0-8b9a-7e6b4f3a2c30',
        serviceType: 'simple_queue',
      })
      .expect(422);

    expect(response.body).toMatchObject({
      code: 'VALIDATION_ERROR',
      correlationId,
    });
  });

  it('no monta la operación de Provisioning ni genera operationId artificial', async () => {
    const response = await request(app)
      .post('/servicios/01890f2e-7b2a-7cc0-8b9a-7e6b4f3a2c20/operaciones')
      .set('Idempotency-Key', 'provision-service-0001')
      .send({
        routerId: '01890f2e-7b2a-7cc0-8b9a-7e6b4f3a2c30',
        type: 'provision',
      })
      .expect(404);

    expect(response.body.code).toBe('RESOURCE_NOT_FOUND');
  });
});
