import { beforeEach, describe, expect, it } from 'vitest';

import type { Clock } from '../../../../backend/application/ports/clock.port.js';
import type { CompanyContext } from '../../../../backend/application/ports/company-context.port.js';
import { ArchiveClient } from '../../../../backend/application/use-cases/clients/archive-client/archive-client.use-case.js';
import { CreateClient } from '../../../../backend/application/use-cases/clients/create-client/create-client.use-case.js';
import { GetClient } from '../../../../backend/application/use-cases/clients/get-client/get-client.use-case.js';
import { ListClients } from '../../../../backend/application/use-cases/clients/list-clients/list-clients.use-case.js';
import { UpdateClient } from '../../../../backend/application/use-cases/clients/update-client/update-client.use-case.js';
import { InMemoryClientRepository } from '../../../../backend/infrastructure/database/clients/in-memory/in-memory-client-repository.js';
import { UuidV7IdGenerator } from '../../../../backend/infrastructure/identity/uuid-v7-id-generator.js';

const companyContext: CompanyContext = { getCompanyId: () => 'company-one' };
const clock: Clock = { now: () => new Date('2026-07-11T10:00:00.000Z') };

describe('Clients use cases', () => {
  let repository: InMemoryClientRepository;
  let createClient: CreateClient;
  let getClient: GetClient;
  let updateClient: UpdateClient;
  let listClients: ListClients;
  let archiveClient: ArchiveClient;

  beforeEach(() => {
    repository = new InMemoryClientRepository();
    createClient = new CreateClient(repository, companyContext, new UuidV7IdGenerator(), clock);
    getClient = new GetClient(repository, companyContext);
    updateClient = new UpdateClient(repository, companyContext, clock);
    listClients = new ListClients(repository, companyContext);
    archiveClient = new ArchiveClient(repository, companyContext, clock);
  });

  async function create(documentNumber = '1234567890101', legalName = 'Ana López') {
    return createClient.execute({
      causationId: 'create-client-0001',
      clientType: 'person',
      correlationId: 'correlation-one',
      documentNumber,
      documentType: 'dpi',
      legalName,
    });
  }

  it('CreateClient persiste el agregado y produce ClientCreated.v1', async () => {
    const result = await create();
    const stored = await getClient.execute({ clientId: result.client.id });

    expect(stored.legalName).toBe('Ana López');
    expect(result.domainEvents.map((event) => event.eventType)).toEqual(['ClientCreated.v1']);
    expect(result.client.id.slice(14, 15)).toBe('7');
  });

  it('CreateClient rechaza documentos activos duplicados por empresa', async () => {
    await create();

    await expect(create('1234567890101', 'Otra persona')).rejects.toMatchObject({
      code: 'CLIENT_DOCUMENT_CONFLICT',
    });
  });

  it('UpdateClient y GetClient actualizan y consultan el cliente', async () => {
    const created = await create();
    const updated = await updateClient.execute({
      clientId: created.client.id,
      legalName: 'Ana López Pérez',
    });

    expect(updated.legalName).toBe('Ana López Pérez');
    await expect(getClient.execute({ clientId: created.client.id })).resolves.toEqual(updated);
  });

  it('ListClients pagina y filtra clientes', async () => {
    await create('1234567890101', 'Ana López');
    await create('1234567890102', 'Bruno Díaz');

    const page = await listClients.execute({ page: 1, pageSize: 25, search: 'bruno' });

    expect(page.total).toBe(1);
    expect(page.data[0]?.legalName).toBe('Bruno Díaz');
  });

  it('ArchiveClient archiva sin borrar el registro', async () => {
    const created = await create();
    await archiveClient.execute({ clientId: created.client.id });

    await expect(getClient.execute({ clientId: created.client.id })).resolves.toMatchObject({
      status: 'archived',
    });
  });
});
