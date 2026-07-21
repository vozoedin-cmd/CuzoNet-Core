import { describe, it, expect, beforeEach } from 'vitest';

import { FakeRouterOsClient } from '../../../../../backend/infrastructure/provisioning/routeros/fake-routeros.client.js';

describe('FakeRouterOsClient.listSimpleQueues', () => {
  let client: FakeRouterOsClient;

  beforeEach(() => {
    client = new FakeRouterOsClient();
  });

  it('lists every created queue', async () => {
    await client.createSimpleQueue({ maxLimit: '5M/20M', name: 'queue-1', target: '192.168.1.10/32' });
    await client.createSimpleQueue({ maxLimit: '10M/40M', name: 'queue-2', target: '192.168.1.11/32' });

    const listed = await client.listSimpleQueues();

    expect(listed.map((q) => q.name)).to.deep.equal(['queue-1', 'queue-2']);
  });

  it('returns an empty array when no queues exist', async () => {
    expect(await client.listSimpleQueues()).to.deep.equal([]);
  });

  it('throws once the client is closed', async () => {
    await client.close();
    await expect(client.listSimpleQueues()).rejects.toThrow('Client is closed');
  });
});
