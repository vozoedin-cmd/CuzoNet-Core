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

  /**
   * Asimetria corregida. El estado real SIEMPRE trae `passthrough` porque el router lo
   * materializa; el deseado puede omitirlo. Sin el default, una regla creada sin declarar
   * `passthrough` quedaba en drift permanente e irreparable: reaplicarla no cambia nada
   * porque el router ya esta como se pidio. Misma lectura que `isEquivalent` del adapter.
   */
  describe('Mangle passthrough default', () => {
    async function mangleHistory(
      steps: readonly { at: string; operation: string; payload: Record<string, unknown> }[],
    ): Promise<void> {
      for (const step of steps) {
        await requestRepo.save(
          completedRequest({
            actionType: `routeros.firewall.mangle.${step.operation}`,
            completedAt: new Date(step.at),
            payload: { routerId: 'router-1', ruleReference: 'marca', ...step.payload },
          }),
        );
      }
    }

    const ADD = {
      action: 'mark-packet',
      chain: 'forward',
      newPacketMark: 'bulk',
    };

    it('materialises passthrough=true when the add never declared it', async () => {
      await mangleHistory([{ at: '2026-07-01T00:00:00.000Z', operation: 'add', payload: ADD }]);

      const [desired] = await repository.getDesiredState('company-1', 'router-1', 'mangle-rule');

      expect(desired?.fields.passthrough).to.equal('true');
    });

    it('preserves an explicit passthrough=false instead of defaulting it', async () => {
      await mangleHistory([
        { at: '2026-07-01T00:00:00.000Z', operation: 'add', payload: { ...ADD, passthrough: false } },
      ]);

      const [desired] = await repository.getDesiredState('company-1', 'router-1', 'mangle-rule');

      expect(desired?.fields.passthrough).to.equal('false');
    });

    it('lets a later update turn passthrough off, and back on', async () => {
      await mangleHistory([
        { at: '2026-07-01T00:00:00.000Z', operation: 'add', payload: ADD },
        { at: '2026-07-02T00:00:00.000Z', operation: 'update', payload: { passthrough: false } },
      ]);

      expect((await repository.getDesiredState('company-1', 'router-1', 'mangle-rule'))[0]?.fields.passthrough)
        .to.equal('false');

      await mangleHistory([
        { at: '2026-07-03T00:00:00.000Z', operation: 'update', payload: { passthrough: true } },
      ]);

      expect((await repository.getDesiredState('company-1', 'router-1', 'mangle-rule'))[0]?.fields.passthrough)
        .to.equal('true');
    });

    /** El default no debe pisar un `false` que ya estaba en el registro por un update anterior. */
    it('does not re-default passthrough on an update that does not mention it', async () => {
      await mangleHistory([
        { at: '2026-07-01T00:00:00.000Z', operation: 'add', payload: { ...ADD, passthrough: false } },
        { at: '2026-07-02T00:00:00.000Z', operation: 'update', payload: { newPacketMark: 'otra' } },
      ]);

      const [desired] = await repository.getDesiredState('company-1', 'router-1', 'mangle-rule');

      expect(desired?.fields).to.include({ newPacketMark: 'otra', passthrough: 'false' });
    });

    it('only defaults Mangle: a Filter rule keeps no passthrough field at all', async () => {
      await requestRepo.save(
        completedRequest({
          actionType: 'routeros.firewall.filter.add',
          completedAt: new Date('2026-07-01T00:00:00.000Z'),
          payload: { action: 'accept', chain: 'forward', routerId: 'router-1', ruleReference: 'f1' },
        }),
      );

      const [desired] = await repository.getDesiredState('company-1', 'router-1', 'filter-rule');

      expect(desired?.fields).to.not.have.property('passthrough');
    });
  });

  describe('Mangle desired-state replay', () => {
    const BASE = {
      action: 'mark-connection',
      chain: 'prerouting',
      newConnectionMark: 'voip-conn',
      protocol: 'udp',
      routerId: 'router-1',
      ruleReference: 'marca-voip',
    };

    async function save(operation: string, payload: Record<string, unknown>, at: string): Promise<void> {
      await requestRepo.save(
        completedRequest({
          actionType: `routeros.firewall.mangle.${operation}`,
          completedAt: new Date(at),
          payload: { routerId: 'router-1', ruleReference: 'marca-voip', ...payload },
        }),
      );
    }

    it('derives exactly the comparable fields from a full add payload', async () => {
      await save('add', {
        ...BASE,
        comment: 'comentario del operador',
        connectionMark: 'CM',
        connectionState: 'new',
        dstAddress: '10.0.0.0/8',
        dstPort: '443',
        inInterface: 'ether1',
        newPacketMark: 'NPM',
        newRoutingMark: 'main',
        outInterface: 'ether2',
        packetMark: 'PM',
        passthrough: true,
        srcAddress: '192.168.1.0/24',
        srcPort: '1024-65535',
      }, '2026-07-01T00:00:00.000Z');

      const [desired] = await repository.getDesiredState('company-1', 'router-1', 'mangle-rule');

      expect(desired?.fields).to.deep.equal({
        action: 'mark-connection',
        chain: 'prerouting',
        connectionMark: 'CM',
        connectionState: 'new',
        dstAddress: '10.0.0.0/8',
        dstPort: '443',
        inInterface: 'ether1',
        newConnectionMark: 'voip-conn',
        newPacketMark: 'NPM',
        newRoutingMark: 'main',
        outInterface: 'ether2',
        packetMark: 'PM',
        passthrough: 'true',
        protocol: 'udp',
        srcAddress: '192.168.1.0/24',
        srcPort: '1024-65535',
      });
      // El comentario tecnico y el de usuario quedan fuera del estado deseado de una regla.
      expect(desired?.fields).to.not.have.property('comment');
      expect(desired?.reference).to.equal('marca-voip');
    });

    it('an update patches only what it declares and preserves the rest', async () => {
      await save('add', BASE, '2026-07-01T00:00:00.000Z');
      await save('update', { protocol: 'tcp' }, '2026-07-02T00:00:00.000Z');

      const [desired] = await repository.getDesiredState('company-1', 'router-1', 'mangle-rule');

      expect(desired?.fields).to.include({
        action: 'mark-connection',
        chain: 'prerouting',
        newConnectionMark: 'voip-conn',
        protocol: 'tcp',
      });
    });

    it.each([
      ['disable', true],
      ['enable', false],
    ] as const)('%s flips the disabled flag without touching the fields', async (operation, expected) => {
      await save('add', { ...BASE, disabled: !expected }, '2026-07-01T00:00:00.000Z');
      await save(operation, {}, '2026-07-02T00:00:00.000Z');

      const [desired] = await repository.getDesiredState('company-1', 'router-1', 'mangle-rule');

      expect(desired?.disabled).to.equal(expected);
      expect(desired?.fields).to.include({ newConnectionMark: 'voip-conn' });
    });

    it('a remove tombstones the reference: the rule is no longer desired', async () => {
      await save('add', BASE, '2026-07-01T00:00:00.000Z');
      await save('remove', {}, '2026-07-02T00:00:00.000Z');

      expect(await repository.getDesiredState('company-1', 'router-1', 'mangle-rule')).to.deep.equal([]);
    });

    it('an add after a remove desires the rule again', async () => {
      await save('add', BASE, '2026-07-01T00:00:00.000Z');
      await save('remove', {}, '2026-07-02T00:00:00.000Z');
      await save('add', BASE, '2026-07-03T00:00:00.000Z');

      expect(await repository.getDesiredState('company-1', 'router-1', 'mangle-rule')).to.have.length(1);
    });

    /**
     * El orden no es declarativo todavia: `desiredPosition` existe en el almacen pero ni el
     * lector ni el comparador lo usan. Un `move` no puede, por tanto, cambiar nada
     * comparable — si lo hiciera, inventaria drift sobre un eje que nadie reconcilia.
     */
    it('a move leaves every comparable field untouched', async () => {
      await save('add', BASE, '2026-07-01T00:00:00.000Z');
      const before = await repository.getDesiredState('company-1', 'router-1', 'mangle-rule');

      await save('move', { position: 0 }, '2026-07-02T00:00:00.000Z');

      expect(await repository.getDesiredState('company-1', 'router-1', 'mangle-rule')).to.deep.equal(before);
    });

    it('an update before any add never resurrects a rule', async () => {
      await save('update', { protocol: 'tcp' }, '2026-07-01T00:00:00.000Z');

      expect(await repository.getDesiredState('company-1', 'router-1', 'mangle-rule')).to.deep.equal([]);
    });
  });

  describe('Raw desired-state replay', () => {
    async function save(operation: string, payload: Record<string, unknown>, at: string): Promise<void> {
      await requestRepo.save(
        completedRequest({
          actionType: `routeros.firewall.raw.${operation}`,
          completedAt: new Date(at),
          payload: { routerId: 'router-1', ruleReference: 'block-bogons', ...payload },
        }),
      );
    }

    const ADD = { action: 'drop', chain: 'prerouting', protocol: 'tcp' };

    it('derives exactly the comparable fields from a full add payload', async () => {
      await save('add', {
        ...ADD,
        addressList: 'escaneos',
        addressListTimeout: '1h',
        comment: 'comentario del operador',
        dstAddress: '10.0.0.0/8',
        dstAddressList: 'destinos',
        dstPort: '443',
        inInterface: 'ether1',
        jumpTarget: 'mi-chain',
        log: true,
        logPrefix: 'RAW',
        outInterface: 'ether2',
        packetMark: 'PM',
        srcAddress: '192.168.1.0/24',
        srcAddressList: 'origenes',
        srcPort: '1024-65535',
        tcpFlags: 'syn',
      }, '2026-07-01T00:00:00.000Z');

      const [desired] = await repository.getDesiredState('company-1', 'router-1', 'raw-rule');

      expect(desired?.fields).to.deep.equal({
        action: 'drop',
        addressList: 'escaneos',
        addressListTimeout: '1h',
        chain: 'prerouting',
        dstAddress: '10.0.0.0/8',
        dstAddressList: 'destinos',
        dstPort: '443',
        inInterface: 'ether1',
        jumpTarget: 'mi-chain',
        log: 'true',
        logPrefix: 'RAW',
        outInterface: 'ether2',
        packetMark: 'PM',
        protocol: 'tcp',
        srcAddress: '192.168.1.0/24',
        srcAddressList: 'origenes',
        srcPort: '1024-65535',
        tcpFlags: 'syn',
      });
      // El comentario tecnico y el de usuario quedan fuera del estado deseado de una regla.
      expect(desired?.fields).to.not.have.property('comment');
      expect(desired?.reference).to.equal('block-bogons');
    });

    /** Raw no recibe ningun default: nada aparece que el payload no declarara. */
    it('adds no default whatsoever to a minimal add', async () => {
      await save('add', ADD, '2026-07-01T00:00:00.000Z');

      const [desired] = await repository.getDesiredState('company-1', 'router-1', 'raw-rule');

      expect(desired?.fields).to.deep.equal({ action: 'drop', chain: 'prerouting', protocol: 'tcp' });
      expect(desired?.fields).to.not.have.property('log');
      expect(desired?.fields).to.not.have.property('passthrough');
    });

    /** `log=false` es la forma no canonica de "sin log": se normaliza a la del router. */
    it('drops a declared log=false, which the router expresses as absence', async () => {
      await save('add', { ...ADD, log: false }, '2026-07-01T00:00:00.000Z');

      const [desired] = await repository.getDesiredState('company-1', 'router-1', 'raw-rule');

      expect(desired?.fields).to.not.have.property('log');
    });

    it('keeps a declared log=true', async () => {
      await save('add', { ...ADD, log: true }, '2026-07-01T00:00:00.000Z');

      expect((await repository.getDesiredState('company-1', 'router-1', 'raw-rule'))[0]?.fields.log).to.equal('true');
    });

    it('an update patches only what it declares and preserves the rest', async () => {
      await save('add', ADD, '2026-07-01T00:00:00.000Z');
      await save('update', { protocol: 'udp' }, '2026-07-02T00:00:00.000Z');

      const [desired] = await repository.getDesiredState('company-1', 'router-1', 'raw-rule');

      expect(desired?.fields).to.include({ action: 'drop', chain: 'prerouting', protocol: 'udp' });
    });

    it('an update can turn logging on and back off', async () => {
      await save('add', ADD, '2026-07-01T00:00:00.000Z');
      await save('update', { log: true }, '2026-07-02T00:00:00.000Z');
      expect((await repository.getDesiredState('company-1', 'router-1', 'raw-rule'))[0]?.fields.log).to.equal('true');

      await save('update', { log: false }, '2026-07-03T00:00:00.000Z');

      expect((await repository.getDesiredState('company-1', 'router-1', 'raw-rule'))[0]?.fields)
        .to.not.have.property('log');
    });

    it.each([
      ['disable', true],
      ['enable', false],
    ] as const)('%s flips the disabled flag without touching the fields', async (operation, expected) => {
      await save('add', { ...ADD, disabled: !expected }, '2026-07-01T00:00:00.000Z');
      await save(operation, {}, '2026-07-02T00:00:00.000Z');

      const [desired] = await repository.getDesiredState('company-1', 'router-1', 'raw-rule');

      expect(desired?.disabled).to.equal(expected);
      expect(desired?.fields).to.include({ protocol: 'tcp' });
    });

    it('a remove tombstones the reference: the rule is no longer desired', async () => {
      await save('add', ADD, '2026-07-01T00:00:00.000Z');
      await save('remove', {}, '2026-07-02T00:00:00.000Z');

      expect(await repository.getDesiredState('company-1', 'router-1', 'raw-rule')).to.deep.equal([]);
    });

    it('an add after a remove desires the rule again', async () => {
      await save('add', ADD, '2026-07-01T00:00:00.000Z');
      await save('remove', {}, '2026-07-02T00:00:00.000Z');
      await save('add', ADD, '2026-07-03T00:00:00.000Z');

      expect(await repository.getDesiredState('company-1', 'router-1', 'raw-rule')).to.have.length(1);
    });

    /** El orden no es declarativo todavia: un `move` no puede cambiar nada comparable. */
    it('a move leaves every comparable field untouched', async () => {
      await save('add', ADD, '2026-07-01T00:00:00.000Z');
      const before = await repository.getDesiredState('company-1', 'router-1', 'raw-rule');

      await save('move', { position: 0 }, '2026-07-02T00:00:00.000Z');

      expect(await repository.getDesiredState('company-1', 'router-1', 'raw-rule')).to.deep.equal(before);
    });

    it('an update before any add never resurrects a rule', async () => {
      await save('update', { protocol: 'udp' }, '2026-07-01T00:00:00.000Z');

      expect(await repository.getDesiredState('company-1', 'router-1', 'raw-rule')).to.deep.equal([]);
    });

    it('never mixes Raw history with the other rule resources', async () => {
      await save('add', ADD, '2026-07-01T00:00:00.000Z');
      await requestRepo.save(
        completedRequest({
          actionType: 'routeros.firewall.mangle.add',
          completedAt: new Date('2026-07-01T00:00:00.000Z'),
          payload: {
            action: 'passthrough', chain: 'prerouting', routerId: 'router-1', ruleReference: 'block-bogons',
          },
        }),
      );

      expect(await repository.getDesiredState('company-1', 'router-1', 'raw-rule')).to.have.length(1);
      expect((await repository.getDesiredState('company-1', 'router-1', 'raw-rule'))[0]?.fields.action)
        .to.equal('drop');
      expect((await repository.getDesiredState('company-1', 'router-1', 'mangle-rule'))[0]?.fields.action)
        .to.equal('passthrough');
    });
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
