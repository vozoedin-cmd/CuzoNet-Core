import request from 'supertest';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { createApp } from '../../../backend/api/http/app.js';
import { DesiredResourceStateController } from '../../../backend/api/synchronization/controller/desired-resource-state.controller.js';
import { createDesiredResourceStateRouter } from '../../../backend/api/synchronization/routes/desired-resource-state.routes.js';
import type { Clock } from '../../../backend/application/ports/clock.port.js';
import type { CompanyContext } from '../../../backend/application/ports/company-context.port.js';
import type { IdGenerator } from '../../../backend/application/ports/id-generator.port.js';
import { GetDesiredResourceState } from '../../../backend/application/use-cases/synchronization/get-desired-resource-state.use-case.js';
import { ListDesiredResourceStates } from '../../../backend/application/use-cases/synchronization/list-desired-resource-states.use-case.js';
import { RemoveDesiredResourceState } from '../../../backend/application/use-cases/synchronization/remove-desired-resource-state.use-case.js';
import { SetDesiredResourceState } from '../../../backend/application/use-cases/synchronization/set-desired-resource-state.use-case.js';
import { SqliteDesiredResourceStateRepository } from '../../../backend/infrastructure/database/synchronization/sqlite/sqlite-desired-resource-state.repository.js';
import { MigrationRunner } from '../../../backend/infrastructure/database/sqlite/migration/migration-runner.js';
import { SqliteDatabase } from '../../../backend/infrastructure/database/sqlite/sqlite-database.js';

const companyContext: CompanyContext = { getCompanyId: () => 'company-1' };
const clock: Clock = { now: () => new Date('2026-07-21T12:00:00.000Z') };
let idCounter = 0;
const idGenerator: IdGenerator = { generate: () => `state-${++idCounter}` };

describe('Desired Resource State API integration', () => {
  let app: ReturnType<typeof createApp>;
  let database: SqliteDatabase;

  beforeEach(() => {
    idCounter = 0;
    database = new SqliteDatabase({ busyTimeoutMs: 2_500, path: ':memory:' });
    new MigrationRunner(database.connection).migrate();
    const repository = new SqliteDesiredResourceStateRepository(database.session);

    const controller = new DesiredResourceStateController({
      getState: new GetDesiredResourceState(repository, companyContext),
      listStates: new ListDesiredResourceStates(repository, companyContext),
      removeState: new RemoveDesiredResourceState(repository, companyContext, clock),
      setState: new SetDesiredResourceState(repository, companyContext, clock, idGenerator),
    });
    app = createApp({ desiredResourceStateRouter: createDesiredResourceStateRouter(controller) });
  });

  afterEach(async () => {
    await database.close();
  });

  const basePath = '/api/v1/synchronization/routers/router-1/desired-state/filter-rule/block-ssh-wan';

  it('creates a desired state via PUT and reads it back via GET', async () => {
    const created = await request(app)
      .put(basePath)
      .send({ desiredFields: { action: 'drop', chain: 'input', protocol: 'tcp' } })
      .expect(200);

    expect(created.body).toMatchObject({ reference: 'block-ssh-wan', resourceType: 'filter-rule', revision: 1 });

    const fetched = await request(app).get(basePath).expect(200);
    expect(fetched.body.desiredFields).toEqual({ action: 'drop', chain: 'input', protocol: 'tcp' });
  });

  it('replaces the desired state declaratively on a second PUT, bumping the revision', async () => {
    await request(app).put(basePath).send({ desiredFields: { protocol: 'tcp' } }).expect(200);

    const updated = await request(app).put(basePath).send({ desiredFields: { protocol: 'udp' } }).expect(200);

    expect(updated.body.revision).to.equal(2);
    expect(updated.body.desiredFields).toEqual({ protocol: 'udp' });
  });

  it('returns 404 for a resource that was never declared', async () => {
    await request(app).get(basePath).expect(404);
  });

  it('deletes a desired state, after which GET returns 404', async () => {
    await request(app).put(basePath).send({ desiredFields: { protocol: 'tcp' } }).expect(200);

    await request(app).delete(basePath).expect(204);

    await request(app).get(basePath).expect(404);
  });

  it('DELETE is idempotent for a resource that was never declared', async () => {
    await request(app).delete(basePath).expect(204);
  });

  it('lists every declared resource for a router+resourceType', async () => {
    await request(app)
      .put('/api/v1/synchronization/routers/router-1/desired-state/filter-rule/r1')
      .send({ desiredFields: {} })
      .expect(200);
    await request(app)
      .put('/api/v1/synchronization/routers/router-1/desired-state/filter-rule/r2')
      .send({ desiredFields: {} })
      .expect(200);

    const listed = await request(app).get('/api/v1/synchronization/routers/router-1/desired-state/filter-rule').expect(200);

    expect(listed.body.map((s: { reference: string }) => s.reference).sort()).toEqual(['r1', 'r2']);
  });

  it('rejects an unknown resourceType with 400', async () => {
    const response = await request(app)
      .put('/api/v1/synchronization/routers/router-1/desired-state/not-a-resource/r1')
      .send({ desiredFields: {} })
      .expect(400);

    expect(response.body.error).to.match(/resourceType inválido/);
  });

  it('rejects a malformed body with 400', async () => {
    await request(app).put(basePath).send({ desiredFields: 'not-an-object' }).expect(400);
  });
});
