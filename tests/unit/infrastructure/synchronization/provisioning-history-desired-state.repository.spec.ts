import { describe, it, expect, beforeEach } from 'vitest';

import { ProvisioningRequest } from '../../../../backend/domain/provisioning/provisioning-request.js';
import { InMemoryProvisioningRequestRepository } from '../../../../backend/infrastructure/database/provisioning/in-memory/in-memory-provisioning-request.repository.js';
import { ProvisioningHistoryDesiredStateRepository } from '../../../../backend/infrastructure/synchronization/provisioning-history-desired-state.repository.js';

let counter = 0;

function completedRequest(params: {
  actionType: string;
  companyId?: string;
  completedAt: Date;
  payload: Record<string, unknown>;
}): ProvisioningRequest {
  counter += 1;
  const id = `req-${counter}`;
  const request = ProvisioningRequest.create({
    actionType: params.actionType,
    companyId: params.companyId ?? 'company-1',
    configurationReference: undefined,
    id,
    idempotencyKey: `key-${id}`,
    inputHash: 'hash',
    inputSnapshotJson: JSON.stringify(params.payload),
    maxAttempts: 3,
    sourceExecutionId: undefined,
    targetId: 'target-1',
    targetType: 'test',
  });
  request.claim('worker-1', params.completedAt);
  request.complete(params.completedAt);
  return request;
}

describe('ProvisioningHistoryDesiredStateRepository', () => {
  let requestRepo: InMemoryProvisioningRequestRepository;
  let repository: ProvisioningHistoryDesiredStateRepository;

  beforeEach(() => {
    counter = 0;
    requestRepo = new InMemoryProvisioningRequestRepository();
    repository = new ProvisioningHistoryDesiredStateRepository(requestRepo);
  });

  it('derives a simple queue from its create request', async () => {
    await requestRepo.save(
      completedRequest({
        actionType: 'routeros.simple_queue.create',
        completedAt: new Date('2026-07-01T00:00:00.000Z'),
        payload: {
          actionType: 'routeros.simple_queue.create',
          maxLimitDownload: '20M',
          maxLimitUpload: '5M',
          queueName: 'queue-1',
          routerId: 'router-1',
          target: '192.168.1.10/32',
        },
      }),
    );

    const desired = await repository.getDesiredState('company-1', 'router-1', 'simple-queue');

    expect(desired).to.deep.equal([
      { disabled: false, fields: { comment: '', maxLimit: '5M/20M', target: '192.168.1.10/32' }, reference: 'queue-1' },
    ]);
  });

  it('merges a later update on top of the original create, then reflects enable/disable', async () => {
    await requestRepo.save(
      completedRequest({
        actionType: 'routeros.simple_queue.create',
        completedAt: new Date('2026-07-01T00:00:00.000Z'),
        payload: {
          maxLimitDownload: '20M',
          maxLimitUpload: '5M',
          queueName: 'queue-1',
          routerId: 'router-1',
          target: '192.168.1.10/32',
        },
      }),
    );
    await requestRepo.save(
      completedRequest({
        actionType: 'routeros.simple_queue.update',
        completedAt: new Date('2026-07-02T00:00:00.000Z'),
        payload: { maxLimitDownload: '40M', maxLimitUpload: '10M', queueReference: 'queue-1', routerId: 'router-1' },
      }),
    );
    await requestRepo.save(
      completedRequest({
        actionType: 'routeros.simple_queue.disable',
        completedAt: new Date('2026-07-03T00:00:00.000Z'),
        payload: { queueReference: 'queue-1', routerId: 'router-1' },
      }),
    );

    const [desired] = await repository.getDesiredState('company-1', 'router-1', 'simple-queue');

    expect(desired?.disabled).to.equal(true);
    expect(desired?.fields.maxLimit).to.equal('10M/40M');
    expect(desired?.fields.target).to.equal('192.168.1.10/32'); // preserved from the original create
  });

  it('excludes a queue whose latest completed request was a remove', async () => {
    await requestRepo.save(
      completedRequest({
        actionType: 'routeros.simple_queue.create',
        completedAt: new Date('2026-07-01T00:00:00.000Z'),
        payload: { maxLimitDownload: '20M', maxLimitUpload: '5M', queueName: 'queue-1', routerId: 'router-1', target: 't' },
      }),
    );
    await requestRepo.save(
      completedRequest({
        actionType: 'routeros.simple_queue.remove',
        completedAt: new Date('2026-07-02T00:00:00.000Z'),
        payload: { queueReference: 'queue-1', routerId: 'router-1' },
      }),
    );

    expect(await repository.getDesiredState('company-1', 'router-1', 'simple-queue')).to.deep.equal([]);
  });

  it('re-includes a resource re-created after being removed', async () => {
    await requestRepo.save(
      completedRequest({
        actionType: 'routeros.simple_queue.create',
        completedAt: new Date('2026-07-01T00:00:00.000Z'),
        payload: { maxLimitDownload: '20M', maxLimitUpload: '5M', queueName: 'queue-1', routerId: 'router-1', target: 't1' },
      }),
    );
    await requestRepo.save(
      completedRequest({
        actionType: 'routeros.simple_queue.remove',
        completedAt: new Date('2026-07-02T00:00:00.000Z'),
        payload: { queueReference: 'queue-1', routerId: 'router-1' },
      }),
    );
    await requestRepo.save(
      completedRequest({
        actionType: 'routeros.simple_queue.create',
        completedAt: new Date('2026-07-03T00:00:00.000Z'),
        payload: { maxLimitDownload: '80M', maxLimitUpload: '20M', queueName: 'queue-1', routerId: 'router-1', target: 't2' },
      }),
    );

    const [desired] = await repository.getDesiredState('company-1', 'router-1', 'simple-queue');
    expect(desired?.fields.target).to.equal('t2');
  });

  it('replays out-of-insertion-order requests in chronological (completedAt) order', async () => {
    // Inserted update-then-create on purpose: the repository must sort by completedAt, not insertion order.
    await requestRepo.save(
      completedRequest({
        actionType: 'routeros.simple_queue.update',
        completedAt: new Date('2026-07-02T00:00:00.000Z'),
        payload: { maxLimitDownload: '99M', maxLimitUpload: '99M', queueReference: 'queue-1', routerId: 'router-1' },
      }),
    );
    await requestRepo.save(
      completedRequest({
        actionType: 'routeros.simple_queue.create',
        completedAt: new Date('2026-07-01T00:00:00.000Z'),
        payload: { maxLimitDownload: '20M', maxLimitUpload: '5M', queueName: 'queue-1', routerId: 'router-1', target: 't' },
      }),
    );

    const [desired] = await repository.getDesiredState('company-1', 'router-1', 'simple-queue');
    expect(desired?.fields.maxLimit).to.equal('99M/99M');
  });

  it('derives an address-list entry with a compound list:address reference', async () => {
    await requestRepo.save(
      completedRequest({
        actionType: 'routeros.firewall.address-list.add',
        completedAt: new Date('2026-07-01T00:00:00.000Z'),
        payload: { address: '192.168.1.10', comment: 'moroso', list: 'blocked-ips', routerId: 'router-1' },
      }),
    );

    const desired = await repository.getDesiredState('company-1', 'router-1', 'address-list-entry');

    // El estado deseado debe reflejar exactamente los campos que el estado real expone;
    // conservar `timeout` aquí dejaría el recurso en `drifted` permanente.
    expect(desired).to.deep.equal([
      { disabled: false, fields: { comment: 'moroso' }, reference: 'blocked-ips:192.168.1.10' },
    ]);
  });

  it('derives a filter rule and merges a protocol update on top of the add', async () => {
    await requestRepo.save(
      completedRequest({
        actionType: 'routeros.firewall.filter.add',
        completedAt: new Date('2026-07-01T00:00:00.000Z'),
        payload: {
          action: 'drop',
          chain: 'input',
          routerId: 'router-1',
          ruleReference: 'block-ssh-wan',
        },
      }),
    );
    await requestRepo.save(
      completedRequest({
        actionType: 'routeros.firewall.filter.update',
        completedAt: new Date('2026-07-02T00:00:00.000Z'),
        payload: { protocol: 'tcp', routerId: 'router-1', ruleReference: 'block-ssh-wan' },
      }),
    );

    const [desired] = await repository.getDesiredState('company-1', 'router-1', 'filter-rule');
    expect(desired?.fields).to.deep.equal({ action: 'drop', chain: 'input', protocol: 'tcp' });
    expect(desired?.reference).to.equal('block-ssh-wan');
  });

  it('ignores move requests for field comparison purposes', async () => {
    await requestRepo.save(
      completedRequest({
        actionType: 'routeros.firewall.filter.add',
        completedAt: new Date('2026-07-01T00:00:00.000Z'),
        payload: { action: 'accept', chain: 'forward', routerId: 'router-1', ruleReference: 'r1' },
      }),
    );
    await requestRepo.save(
      completedRequest({
        actionType: 'routeros.firewall.filter.move',
        completedAt: new Date('2026-07-02T00:00:00.000Z'),
        payload: { position: 0, routerId: 'router-1', ruleReference: 'r1' },
      }),
    );

    const [desired] = await repository.getDesiredState('company-1', 'router-1', 'filter-rule');
    expect(desired?.fields).to.deep.equal({ action: 'accept', chain: 'forward' });
  });

  it('derives a NAT rule including toAddresses/toPorts', async () => {
    await requestRepo.save(
      completedRequest({
        actionType: 'routeros.firewall.nat.add',
        completedAt: new Date('2026-07-01T00:00:00.000Z'),
        payload: {
          action: 'dst-nat',
          chain: 'dstnat',
          routerId: 'router-1',
          ruleReference: 'forward-web',
          toAddresses: '192.168.1.10',
          toPorts: '80',
        },
      }),
    );

    const [desired] = await repository.getDesiredState('company-1', 'router-1', 'nat-rule');
    expect(desired?.fields).to.include({ toAddresses: '192.168.1.10', toPorts: '80' });
  });

  it('derives a Mangle rule including marks and passthrough', async () => {
    await requestRepo.save(
      completedRequest({
        actionType: 'routeros.firewall.mangle.add',
        completedAt: new Date('2026-07-01T00:00:00.000Z'),
        payload: {
          action: 'mark-connection',
          chain: 'prerouting',
          newConnectionMark: 'voip-conn',
          passthrough: true,
          routerId: 'router-1',
          ruleReference: 'mark-voip',
        },
      }),
    );

    const [desired] = await repository.getDesiredState('company-1', 'router-1', 'mangle-rule');
    expect(desired?.fields).to.include({ newConnectionMark: 'voip-conn', passthrough: 'true' });
  });

  it('only considers requests for the requested router', async () => {
    await requestRepo.save(
      completedRequest({
        actionType: 'routeros.firewall.filter.add',
        completedAt: new Date('2026-07-01T00:00:00.000Z'),
        payload: { action: 'accept', chain: 'forward', routerId: 'router-1', ruleReference: 'r1' },
      }),
    );
    await requestRepo.save(
      completedRequest({
        actionType: 'routeros.firewall.filter.add',
        completedAt: new Date('2026-07-01T00:00:00.000Z'),
        payload: { action: 'drop', chain: 'input', routerId: 'router-2', ruleReference: 'r2' },
      }),
    );

    const desiredForRouter1 = await repository.getDesiredState('company-1', 'router-1', 'filter-rule');
    expect(desiredForRouter1.map((r) => r.reference)).to.deep.equal(['r1']);
  });

  it('only considers completed requests, ignoring pending/failed ones', async () => {
    const pending = ProvisioningRequest.create({
      actionType: 'routeros.firewall.filter.add',
      companyId: 'company-1',
      configurationReference: undefined,
      id: 'pending-1',
      idempotencyKey: 'key-pending-1',
      inputHash: 'hash',
      inputSnapshotJson: JSON.stringify({ action: 'accept', chain: 'forward', routerId: 'router-1', ruleReference: 'r1' }),
      maxAttempts: 3,
      sourceExecutionId: undefined,
      targetId: 'target-1',
      targetType: 'test',
    });
    await requestRepo.save(pending);

    expect(await repository.getDesiredState('company-1', 'router-1', 'filter-rule')).to.deep.equal([]);
  });
});
