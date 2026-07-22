import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import type { Clock } from '../../../backend/application/ports/clock.port.js';
import type { CompanyContext } from '../../../backend/application/ports/company-context.port.js';
import type { IdGenerator } from '../../../backend/application/ports/id-generator.port.js';
import { BackfillDesiredState } from '../../../backend/application/use-cases/synchronization/backfill-desired-state.use-case.js';
import { ProvisioningRequest } from '../../../backend/domain/provisioning/provisioning-request.js';
import { DesiredResourceState } from '../../../backend/domain/synchronization/desired-resource-state.js';
import { InMemoryProvisioningRequestRepository } from '../../../backend/infrastructure/database/provisioning/in-memory/in-memory-provisioning-request.repository.js';
import { SqliteDesiredResourceStateRepository } from '../../../backend/infrastructure/database/synchronization/sqlite/sqlite-desired-resource-state.repository.js';
import { MigrationRunner } from '../../../backend/infrastructure/database/sqlite/migration/migration-runner.js';
import { SqliteDatabase } from '../../../backend/infrastructure/database/sqlite/sqlite-database.js';
import { ProvisioningHistoryDesiredStateRepository } from '../../../backend/infrastructure/synchronization/provisioning-history-desired-state.repository.js';

const companyContext: CompanyContext = { getCompanyId: () => 'company-1' };
const clock: Clock = { now: () => new Date('2026-07-21T12:00:00.000Z') };
let idCounter = 0;
const idGenerator: IdGenerator = { generate: () => `state-${++idCounter}` };

let requestCounter = 0;
function completedRequest(actionType: string, payload: Record<string, unknown>): ProvisioningRequest {
  requestCounter += 1;
  const id = `req-${requestCounter}`;
  const request = ProvisioningRequest.create({
    actionType,
    companyId: 'company-1',
    configurationReference: undefined,
    id,
    idempotencyKey: `key-${id}`,
    inputHash: 'hash',
    inputSnapshotJson: JSON.stringify(payload),
    maxAttempts: 3,
    sourceExecutionId: undefined,
    targetId: 'target-1',
    targetType: 'test',
  });
  request.claim('worker-1', clock.now());
  request.complete(clock.now());
  return request;
}

describe('BackfillDesiredState (real SQLite store + in-memory provisioning history)', () => {
  let database: SqliteDatabase;
  let requestRepo: InMemoryProvisioningRequestRepository;
  let desiredResourceStateRepo: SqliteDesiredResourceStateRepository;
  let backfill: BackfillDesiredState;

  beforeEach(() => {
    idCounter = 0;
    requestCounter = 0;
    database = new SqliteDatabase({ busyTimeoutMs: 2_500, path: ':memory:' });
    new MigrationRunner(database.connection).migrate();
    requestRepo = new InMemoryProvisioningRequestRepository();
    desiredResourceStateRepo = new SqliteDesiredResourceStateRepository(database.session);
    const historyRepo = new ProvisioningHistoryDesiredStateRepository(requestRepo);
    backfill = new BackfillDesiredState(historyRepo, desiredResourceStateRepo, requestRepo, companyContext, clock, idGenerator);
  });

  afterEach(async () => {
    await database.close();
  });

  it('seeds the declarative store from real provisioning history end-to-end', async () => {
    await requestRepo.save(
      completedRequest('routeros.firewall.filter.add', {
        action: 'drop',
        chain: 'input',
        routerId: 'router-1',
        ruleReference: 'block-ssh-wan',
      }),
    );
    await requestRepo.save(
      completedRequest('routeros.firewall.nat.add', {
        action: 'masquerade',
        chain: 'srcnat',
        routerId: 'router-1',
        ruleReference: 'wan-masquerade',
      }),
    );

    const summary = await backfill.execute({ dryRun: false });

    expect(summary.totals.created).to.equal(2);
    const filterState = await desiredResourceStateRepo.findByReference('company-1', 'router-1', 'filter-rule', 'block-ssh-wan');
    expect(filterState?.desiredFields).to.include({ action: 'drop', chain: 'input' });
    const natState = await desiredResourceStateRepo.findByReference('company-1', 'router-1', 'nat-rule', 'wan-masquerade');
    expect(natState?.desiredFields).to.include({ action: 'masquerade', chain: 'srcnat' });
  });

  it('is a true no-op in dry-run mode against the real SQLite store', async () => {
    await requestRepo.save(
      completedRequest('routeros.firewall.filter.add', { action: 'accept', chain: 'forward', routerId: 'router-1', ruleReference: 'r1' }),
    );

    const summary = await backfill.execute({ dryRun: true });

    expect(summary.totals.created).to.equal(1);
    expect(await desiredResourceStateRepo.findByReference('company-1', 'router-1', 'filter-rule', 'r1')).to.equal(undefined);
  });

  it('running it twice in a row is fully idempotent (second run creates nothing)', async () => {
    await requestRepo.save(
      completedRequest('routeros.firewall.filter.add', { action: 'accept', chain: 'forward', routerId: 'router-1', ruleReference: 'r1' }),
    );

    const first = await backfill.execute({ dryRun: false });
    const second = await backfill.execute({ dryRun: false });

    expect(first.totals.created).to.equal(1);
    expect(second.totals.created).to.equal(0);
    expect(second.totals.skipped).to.equal(1);
  });

  it('never overwrites a resource the operator already declared manually through the Hito 21.5 API surface', async () => {
    await requestRepo.save(
      completedRequest('routeros.firewall.filter.add', { action: 'accept', chain: 'forward', routerId: 'router-1', ruleReference: 'r1' }),
    );
    // Simulate a prior manual declaration with a DIFFERENT desired shape.
    await desiredResourceStateRepo.save(
      DesiredResourceState.create(
        { companyId: 'company-1', desiredFields: { action: 'drop', chain: 'forward' }, disabled: false, id: 'manual-1', reference: 'r1', resourceType: 'filter-rule', routerId: 'router-1' },
        clock.now(),
      ),
    );

    await backfill.execute({ dryRun: false });

    const state = await desiredResourceStateRepo.findByReference('company-1', 'router-1', 'filter-rule', 'r1');
    expect(state?.id).to.equal('manual-1');
    expect(state?.desiredFields).to.deep.equal({ action: 'drop', chain: 'forward' });
  });
});
