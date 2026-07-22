import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { DesiredResourceState } from '../../../backend/domain/synchronization/desired-resource-state.js';
import { SqliteDesiredResourceStateRepository } from '../../../backend/infrastructure/database/synchronization/sqlite/sqlite-desired-resource-state.repository.js';
import { MigrationRunner } from '../../../backend/infrastructure/database/sqlite/migration/migration-runner.js';
import { SqliteDatabase } from '../../../backend/infrastructure/database/sqlite/sqlite-database.js';
import { SqliteDesiredStateRepository } from '../../../backend/infrastructure/synchronization/sqlite-desired-state.repository.js';

const at = new Date('2026-07-21T12:00:00.000Z');

function build(overrides: Partial<Parameters<typeof DesiredResourceState.create>[0]> = {}): DesiredResourceState {
  return DesiredResourceState.create(
    {
      companyId: 'company-1',
      desiredFields: { protocol: 'tcp' },
      disabled: false,
      id: `state-${Math.random().toString(36).slice(2)}`,
      reference: 'block-ssh-wan',
      resourceType: 'filter-rule',
      routerId: 'router-1',
      ...overrides,
    },
    at,
  );
}

describe('SqliteDesiredResourceStateRepository', () => {
  let database: SqliteDatabase;
  let repository: SqliteDesiredResourceStateRepository;

  beforeEach(() => {
    database = new SqliteDatabase({ busyTimeoutMs: 2_500, path: ':memory:' });
    new MigrationRunner(database.connection).migrate();
    repository = new SqliteDesiredResourceStateRepository(database.session);
  });

  afterEach(async () => {
    await database.close();
  });

  it('persists and rehydrates a state faithfully, including desiredPosition and revision', async () => {
    const state = build({ desiredPosition: 3, id: 'state-1' });
    await repository.save(state);

    const found = await repository.findByReference('company-1', 'router-1', 'filter-rule', 'block-ssh-wan');

    expect(found?.toProps()).to.deep.equal(state.toProps());
  });

  it('returns undefined for an identity that was never saved', async () => {
    expect(await repository.findByReference('company-1', 'router-1', 'filter-rule', 'missing')).to.equal(undefined);
  });

  it('persists an update to an existing row (upsert by id)', async () => {
    const state = build({ id: 'state-1' });
    await repository.save(state);

    state.replace({ protocol: 'udp' }, true, 2, new Date('2026-07-22T00:00:00.000Z'));
    await repository.save(state);

    const found = await repository.findByReference('company-1', 'router-1', 'filter-rule', 'block-ssh-wan');
    expect(found?.desiredFields).to.deep.equal({ protocol: 'udp' });
    expect(found?.disabled).to.equal(true);
    expect(found?.desiredPosition).to.equal(2);
    expect(found?.revision).to.equal(2);
  });

  it('enforces one active (non-deleted) identity per company+router+resourceType+reference', async () => {
    const state = build({ id: 'state-1' });
    await repository.save(state);

    const conflicting = build({ id: 'state-2' });
    await expect(repository.save(conflicting)).rejects.toThrow();
  });

  it('findByReference locates a soft-deleted row so it can be resurrected in place (the actual SetDesiredResourceState flow)', async () => {
    const state = build({ id: 'state-1' });
    await repository.save(state);
    state.markDeleted(new Date('2026-07-22T00:00:00.000Z'));
    await repository.save(state);

    const found = await repository.findByReference('company-1', 'router-1', 'filter-rule', 'block-ssh-wan');
    expect(found?.isDeleted).to.equal(true);

    found!.replace({ protocol: 'udp' }, false, undefined, new Date('2026-07-23T00:00:00.000Z'));
    await repository.save(found!);

    const resurrected = await repository.findByReference('company-1', 'router-1', 'filter-rule', 'block-ssh-wan');
    expect(resurrected?.id).to.equal('state-1');
    expect(resurrected?.isDeleted).to.equal(false);
    expect(resurrected?.desiredFields).to.deep.equal({ protocol: 'udp' });
  });

  it('rejects inserting a second row for an identity while an active (non-deleted) row already owns it', async () => {
    await repository.save(build({ id: 'state-1' }));

    await expect(repository.save(build({ id: 'state-2' }))).rejects.toThrow();
  });

  it('lists only non-deleted states scoped to company+router+resourceType', async () => {
    await repository.save(build({ id: 'state-1', reference: 'r1' }));
    await repository.save(build({ id: 'state-2', reference: 'r2' }));
    const deleted = build({ id: 'state-3', reference: 'r3' });
    deleted.markDeleted(new Date());
    await repository.save(deleted);
    await repository.save(build({ companyId: 'company-2', id: 'state-4', reference: 'r4' }));
    await repository.save(build({ id: 'state-5', reference: 'r5', resourceType: 'nat-rule' }));

    const listed = await repository.listByRouter('company-1', 'router-1', 'filter-rule');

    expect(listed.map((s) => s.reference).sort()).to.deep.equal(['r1', 'r2']);
  });

  it('isolates identical references across different companies', async () => {
    await repository.save(build({ companyId: 'company-1', id: 'state-1' }));
    await expect(repository.save(build({ companyId: 'company-2', id: 'state-2' }))).resolves.toBeUndefined();

    expect(await repository.findByReference('company-1', 'router-1', 'filter-rule', 'block-ssh-wan')).to.not.equal(undefined);
    expect(await repository.findByReference('company-2', 'router-1', 'filter-rule', 'block-ssh-wan')).to.not.equal(undefined);
  });
});

describe('SqliteDesiredStateRepository (read-side adapter)', () => {
  let database: SqliteDatabase;
  let writeRepository: SqliteDesiredResourceStateRepository;
  let readRepository: SqliteDesiredStateRepository;

  beforeEach(() => {
    database = new SqliteDatabase({ busyTimeoutMs: 2_500, path: ':memory:' });
    new MigrationRunner(database.connection).migrate();
    writeRepository = new SqliteDesiredResourceStateRepository(database.session);
    readRepository = new SqliteDesiredStateRepository(writeRepository);
  });

  afterEach(async () => {
    await database.close();
  });

  it('normalizes stored states into NormalizedResourceRecord shape for the Synchronization Engine', async () => {
    await writeRepository.save(build({ id: 'state-1' }));

    const records = await readRepository.getDesiredState('company-1', 'router-1', 'filter-rule');

    expect(records).to.deep.equal([{ disabled: false, fields: { protocol: 'tcp' }, reference: 'block-ssh-wan' }]);
  });

  it('excludes soft-deleted states', async () => {
    const state = build({ id: 'state-1' });
    await writeRepository.save(state);
    state.markDeleted(new Date());
    await writeRepository.save(state);

    expect(await readRepository.getDesiredState('company-1', 'router-1', 'filter-rule')).to.deep.equal([]);
  });
});
