import { createHmac } from 'node:crypto';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { ProvisioningEventEnvelope } from '../../../backend/application/ports/provisioning/provisioning-event-envelope.js';
import type { SecretProviderPort } from '../../../backend/application/ports/provisioning/routeros/secret-provider.port.js';
import { WebhookProvisioningEventPublisher } from '../../../backend/infrastructure/provisioning/events/webhook-provisioning-event.publisher.js';

interface ReceivedRequest {
  readonly body: string;
  readonly headers: IncomingMessage['headers'];
  readonly url: string | undefined;
}

async function startFakeServer(
  handler: (request: ReceivedRequest) => number,
): Promise<{ close: () => Promise<void>; received: ReceivedRequest[]; url: string }> {
  const received: ReceivedRequest[] = [];
  const server: Server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf8');
      const entry = { body, headers: request.headers, url: request.url };
      received.push(entry);
      const status = handler(entry);
      response.writeHead(status);
      response.end();
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    close: () => new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))),
    received,
    url: `http://127.0.0.1:${port}/hook`,
  };
}

function buildEvent(): ProvisioningEventEnvelope {
  return {
    aggregateId: 'req-1',
    aggregateType: 'ProvisioningRequest',
    causationId: 'req-1',
    companyId: 'company-1',
    correlationId: 'req-1',
    eventId: 'event-integration-1',
    eventType: 'ProvisioningSucceeded.v1',
    occurredAt: '2026-07-20T12:00:00.000Z',
    payload: { requestId: 'req-1' },
    schemaVersion: 1,
  };
}

const secretProvider: SecretProviderPort = { getSecret: async (reference) => (reference === 'WEBHOOK_SECRET' ? 'top-secret' : null) };

describe('WebhookProvisioningEventPublisher against a real HTTP server', () => {
  let servers: { close: () => Promise<void> }[] = [];

  beforeEach(() => {
    servers = [];
  });

  afterEach(async () => {
    await Promise.all(servers.map((server) => server.close()));
  });

  it('delivers the event body and identity headers to a live HTTP endpoint', async () => {
    const fake = await startFakeServer(() => 204);
    servers.push(fake);
    const publisher = new WebhookProvisioningEventPublisher([{ url: fake.url }], secretProvider, {
      allowHttp: true,
    });
    const event = buildEvent();

    await publisher.publish(event);

    expect(fake.received).toHaveLength(1);
    const [request] = fake.received;
    expect(JSON.parse(request!.body)).toEqual(event);
    expect(request!.headers['idempotency-key']).toBe('event-integration-1');
    expect(request!.headers['x-provisioning-event-type']).toBe('ProvisioningSucceeded.v1');
    expect(request!.headers['x-provisioning-signature']).toBeUndefined();
  });

  it('sends a valid HMAC signature that the receiving server can independently verify', async () => {
    const fake = await startFakeServer((request) => {
      const expected = `sha256=${createHmac('sha256', 'top-secret').update(request.body).digest('hex')}`;
      return request.headers['x-provisioning-signature'] === expected ? 200 : 401;
    });
    servers.push(fake);
    const publisher = new WebhookProvisioningEventPublisher(
      [{ hmacSecretReference: 'WEBHOOK_SECRET', url: fake.url }],
      secretProvider,
      { allowHttp: true },
    );

    await expect(publisher.publish(buildEvent())).resolves.toBeUndefined();
  });

  it('retries against the real server after a transient 503 and eventually succeeds', async () => {
    let requestCount = 0;
    const fake = await startFakeServer(() => {
      requestCount += 1;
      return requestCount < 3 ? 503 : 200;
    });
    servers.push(fake);
    const publisher = new WebhookProvisioningEventPublisher([{ url: fake.url }], secretProvider, {
      allowHttp: true,
      baseRetryDelayMs: 5,
      maxAttemptsPerEndpoint: 4,
    });

    await expect(publisher.publish(buildEvent())).resolves.toBeUndefined();
    expect(requestCount).toBe(3);
  });

  it('gives up after exhausting attempts against a permanently failing server', async () => {
    const fake = await startFakeServer(() => 500);
    servers.push(fake);
    const publisher = new WebhookProvisioningEventPublisher([{ url: fake.url }], secretProvider, {
      allowHttp: true,
      baseRetryDelayMs: 5,
      maxAttemptsPerEndpoint: 2,
    });

    await expect(publisher.publish(buildEvent())).rejects.toThrow();
    expect(fake.received).toHaveLength(2);
  });

  it('fans out to two independent live servers and requires both to succeed', async () => {
    const first = await startFakeServer(() => 200);
    const second = await startFakeServer(() => 200);
    servers.push(first, second);
    const publisher = new WebhookProvisioningEventPublisher(
      [{ url: first.url }, { url: second.url }],
      secretProvider,
      { allowHttp: true },
    );

    await expect(publisher.publish(buildEvent())).resolves.toBeUndefined();
    expect(first.received).toHaveLength(1);
    expect(second.received).toHaveLength(1);
  });

  it('times out against a server that never responds and treats it as retryable', async () => {
    const hangingServer = createServer(() => {
      // Never respond, forcing the client-side timeout to fire.
    });
    await new Promise<void>((resolve) => hangingServer.listen(0, '127.0.0.1', resolve));
    const { port } = hangingServer.address() as AddressInfo;
    servers.push({
      close: () => new Promise<void>((resolve, reject) => hangingServer.close((error) => (error ? reject(error) : resolve()))),
    });
    const publisher = new WebhookProvisioningEventPublisher(
      [{ url: `http://127.0.0.1:${port}/hook` }],
      secretProvider,
      { allowHttp: true, baseRetryDelayMs: 5, maxAttemptsPerEndpoint: 1, timeoutMs: 150 },
    );

    await expect(publisher.publish(buildEvent())).rejects.toThrow(/tiempo máximo/);
  });
});
