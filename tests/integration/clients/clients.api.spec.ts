import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';

import { ClientsController } from '../../../backend/api/clients/controller/clients.controller.js';
import { createClientsRouter } from '../../../backend/api/clients/routes/clients.routes.js';
import { createApp } from '../../../backend/api/http/app.js';
import type { Clock } from '../../../backend/application/ports/clock.port.js';
import type { CompanyContext } from '../../../backend/application/ports/company-context.port.js';
import { ArchiveClient } from '../../../backend/application/use-cases/clients/archive-client/archive-client.use-case.js';
import { CreateClient } from '../../../backend/application/use-cases/clients/create-client/create-client.use-case.js';
import { GetClient } from '../../../backend/application/use-cases/clients/get-client/get-client.use-case.js';
import { ListClients } from '../../../backend/application/use-cases/clients/list-clients/list-clients.use-case.js';
import { UpdateClient } from '../../../backend/application/use-cases/clients/update-client/update-client.use-case.js';
import { InMemoryClientRepository } from '../../../backend/infrastructure/database/clients/in-memory/in-memory-client-repository.js';
import { UuidV7IdGenerator } from '../../../backend/infrastructure/identity/uuid-v7-id-generator.js';

const correlationId = '5c2cb32f-3bc5-4b24-9a2d-a79dc0608e5f';
const clock: Clock = { now: () => new Date('2026-07-11T10:00:00.000Z') };
const companyContext: CompanyContext = { getCompanyId: () => 'company-one' };

function createTestApp() {
  const repository = new InMemoryClientRepository();
  const idGenerator = new UuidV7IdGenerator();
  const controller = new ClientsController({
    archiveClient: new ArchiveClient(repository, companyContext, clock),
    createClient: new CreateClient(repository, companyContext, idGenerator, clock),
    getClient: new GetClient(repository, companyContext),
    listClients: new ListClients(repository, companyContext),
    updateClient: new UpdateClient(repository, companyContext, clock),
  });

  return createApp({ clientsRouter: createClientsRouter(controller) });
}

const validClient = {
  clientType: 'person',
  legalName: 'Ana López',
  documentType: 'dpi',
  documentNumber: '1234567890101',
  contacts: [
    {
      type: 'phone',
      value: '+50255550001',
      isPrimary: true,
    },
  ],
  addresses: [
    {
      label: 'Casa',
      addressLine: 'Zona 1, Guatemala',
      isServiceAddress: true,
    },
  ],
  note: 'Cliente creado por prueba.',
} as const;

describe('Clients API integration', () => {
  let app: ReturnType<typeof createTestApp>;

  beforeEach(() => {
    app = createTestApp();
  });

  it('ejecuta Create, Get, Update, List y Archive mediante las rutas contractuales', async () => {
    const createResponse = await request(app)
      .post('/api/v1/clientes')
      .set('Idempotency-Key', 'create-client-0001')
      .set('X-Correlation-Id', correlationId)
      .send(validClient)
      .expect(201);

    expect(createResponse.body).toEqual({
      addresses: validClient.addresses,
      clientType: 'person',
      contacts: validClient.contacts,
      createdAt: '2026-07-11T10:00:00.000Z',
      documentNumber: '1234567890101',
      documentType: 'dpi',
      id: createResponse.body.id,
      legalName: 'Ana López',
      status: 'active',
    });
    expect(createResponse.body.id.slice(14, 15)).toBe('7');

    await request(app)
      .get(`/api/v1/clientes/${createResponse.body.id}`)
      .expect(200)
      .expect((response) => expect(response.body.legalName).toBe('Ana López'));

    await request(app)
      .put(`/api/v1/clientes/${createResponse.body.id}`)
      .set('Idempotency-Key', 'update-client-0001')
      .send({ legalName: 'Ana López Pérez' })
      .expect(200)
      .expect((response) => expect(response.body.legalName).toBe('Ana López Pérez'));

    await request(app)
      .get('/api/v1/clientes?page=1&pageSize=25&search=pérez')
      .expect(200)
      .expect((response) => {
        expect(response.body).toMatchObject({ page: 1, pageSize: 25, total: 1 });
        expect(response.body.data).toHaveLength(1);
      });

    await request(app)
      .delete(`/api/v1/clientes/${createResponse.body.id}`)
      .set('Idempotency-Key', 'archive-client-0001')
      .expect(204);

    await request(app)
      .get(`/api/v1/clientes/${createResponse.body.id}`)
      .expect(200)
      .expect((response) => expect(response.body.status).toBe('archived'));
  });

  it('devuelve 409 mediante el manejador global para documento duplicado', async () => {
    await request(app)
      .post('/api/v1/clientes')
      .set('Idempotency-Key', 'create-client-0001')
      .send(validClient)
      .expect(201);

    const response = await request(app)
      .post('/api/v1/clientes')
      .set('Idempotency-Key', 'create-client-0002')
      .set('X-Correlation-Id', correlationId)
      .send({ ...validClient, legalName: 'Otra persona' })
      .expect(409);

    expect(response.body).toEqual({
      code: 'CLIENT_DOCUMENT_CONFLICT',
      correlationId,
      message: 'Ya existe un cliente activo con ese documento.',
    });
  });

  it('devuelve ValidationProblem 422 sin exponer detalles internos', async () => {
    const response = await request(app)
      .post('/api/v1/clientes')
      .set('Idempotency-Key', 'create-client-0001')
      .set('X-Correlation-Id', correlationId)
      .send({ ...validClient, legalName: 'A' })
      .expect(422);

    expect(response.body).toMatchObject({
      code: 'VALIDATION_ERROR',
      correlationId,
      message: 'La solicitud contiene datos inválidos.',
      fields: [{ path: 'body.legalName' }],
    });
    expect(JSON.stringify(response.body)).not.toContain('stack');
  });
});
