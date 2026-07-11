import { describe, expect, it } from 'vitest';

import type { Clock } from '../../../backend/application/ports/clock.port.js';
import type { CompanyContext } from '../../../backend/application/ports/company-context.port.js';
import { ArchiveClient } from '../../../backend/application/use-cases/clients/archive-client/archive-client.use-case.js';
import { CreateClient } from '../../../backend/application/use-cases/clients/create-client/create-client.use-case.js';
import { InMemoryClientRepository } from '../../../backend/infrastructure/database/clients/in-memory/in-memory-client-repository.js';
import { UuidV7IdGenerator } from '../../../backend/infrastructure/identity/uuid-v7-id-generator.js';

const clock: Clock = { now: () => new Date('2026-07-11T10:00:00.000Z') };
const companyContext: CompanyContext = { getCompanyId: () => 'company-one' };

describe('InMemoryClientRepository integration', () => {
  it('aísla registros por empresa y devuelve agregados rehidratados', async () => {
    const repository = new InMemoryClientRepository();
    const createClient = new CreateClient(
      repository,
      companyContext,
      new UuidV7IdGenerator(),
      clock,
    );
    const result = await createClient.execute({
      causationId: 'create-client-0001',
      clientType: 'person',
      correlationId: 'correlation-one',
      documentNumber: '1234567890101',
      documentType: 'dpi',
      legalName: 'Ana López',
    });

    const stored = await repository.findById('company-one', result.client.id);
    const foreignCompanyRecord = await repository.findById('company-two', result.client.id);

    expect(stored?.legalName.value).toBe('Ana López');
    expect(foreignCompanyRecord).toBeNull();
  });

  it('libera la unicidad documental al archivar', async () => {
    const repository = new InMemoryClientRepository();
    const idGenerator = new UuidV7IdGenerator();
    const createClient = new CreateClient(repository, companyContext, idGenerator, clock);
    const archiveClient = new ArchiveClient(repository, companyContext, clock);
    const first = await createClient.execute({
      causationId: 'create-client-0001',
      clientType: 'person',
      correlationId: 'correlation-one',
      documentNumber: '1234567890101',
      documentType: 'dpi',
      legalName: 'Ana López',
    });

    await archiveClient.execute({ clientId: first.client.id });

    await expect(
      createClient.execute({
        causationId: 'create-client-0002',
        clientType: 'person',
        correlationId: 'correlation-two',
        documentNumber: '1234567890101',
        documentType: 'dpi',
        legalName: 'Ana López Nueva',
      }),
    ).resolves.toMatchObject({ client: { status: 'active' } });
  });
});
