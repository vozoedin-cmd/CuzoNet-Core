import { createHmac } from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

import type { ProvisioningEventEnvelope } from '../../../../backend/application/ports/provisioning/provisioning-event-envelope.js';
import type { SecretProviderPort } from '../../../../backend/application/ports/provisioning/routeros/secret-provider.port.js';
import { WebhookProvisioningEventPublisher } from '../../../../backend/infrastructure/provisioning/events/webhook-provisioning-event.publisher.js';

function buildEvent(overrides: Partial<ProvisioningEventEnvelope> = {}): ProvisioningEventEnvelope {
  return {
    aggregateId: 'req-1',
    aggregateType: 'ProvisioningRequest',
    causationId: 'req-1',
    companyId: 'company-1',
    correlationId: 'req-1',
    eventId: 'event-1',
    eventType: 'ProvisioningSucceeded.v1',
    occurredAt: '2026-07-20T12:00:00.000Z',
    payload: { requestId: 'req-1' },
    schemaVersion: 1,
    ...overrides,
  };
}

const secretProvider: SecretProviderPort = { getSecret: async () => 'shared-secret' };

describe('WebhookProvisioningEventPublisher', () => {
  it('rejects construction without at least one endpoint', () => {
    expect(() => new WebhookProvisioningEventPublisher([], secretProvider)).toThrow();
  });

  it('rejects an insecure (http) endpoint by default', () => {
    expect(
      () => new WebhookProvisioningEventPublisher([{ url: 'http://example.test/hook' }], secretProvider),
    ).toThrow('HTTPS');
  });

  it('rejects a URL carrying embedded credentials', () => {
    expect(
      () =>
        new WebhookProvisioningEventPublisher([{ url: 'https://user:pass@example.test/hook' }], secretProvider),
    ).toThrow('credenciales');
  });

  it('posts the event as JSON with Idempotency-Key and event-type headers, no HMAC when unconfigured', async () => {
    const fetchImplementation = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 204 }));
    const publisher = new WebhookProvisioningEventPublisher(
      [{ url: 'https://example.test/hook' }],
      secretProvider,
      { fetchImplementation },
    );
    const event = buildEvent();

    await publisher.publish(event);

    expect(fetchImplementation).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImplementation.mock.calls[0]!;
    expect(url).toBe('https://example.test/hook');
    expect(init?.method).toBe('POST');
    expect(init?.redirect).toBe('manual');
    const headers = init?.headers as Record<string, string>;
    expect(headers['idempotency-key']).toBe('event-1');
    expect(headers['x-provisioning-event-type']).toBe('ProvisioningSucceeded.v1');
    expect(headers['x-provisioning-signature']).toBeUndefined();
    expect(JSON.parse(init?.body as string)).toEqual(event);
  });

  it('signs the body with HMAC-SHA256 when an endpoint has a credentialReference configured', async () => {
    const fetchImplementation = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 200 }));
    const publisher = new WebhookProvisioningEventPublisher(
      [{ hmacSecretReference: 'PROVISIONING_WEBHOOK_SECRET', url: 'https://example.test/hook' }],
      secretProvider,
      { fetchImplementation },
    );
    const event = buildEvent();

    await publisher.publish(event);

    const [, init] = fetchImplementation.mock.calls[0]!;
    const headers = init?.headers as Record<string, string>;
    const expectedSignature = `sha256=${createHmac('sha256', 'shared-secret').update(init?.body as string).digest('hex')}`;
    expect(headers['x-provisioning-signature']).toBe(expectedSignature);
  });

  it('fails permanently (no retry) when the configured HMAC secret cannot be resolved', async () => {
    const fetchImplementation = vi.fn<typeof fetch>();
    const missingSecretProvider: SecretProviderPort = { getSecret: async () => null };
    const publisher = new WebhookProvisioningEventPublisher(
      [{ hmacSecretReference: 'MISSING', url: 'https://example.test/hook' }],
      missingSecretProvider,
      { fetchImplementation, maxAttemptsPerEndpoint: 3 },
    );

    await expect(publisher.publish(buildEvent())).rejects.toThrow(/Secreto HMAC no encontrado/);
    expect(fetchImplementation).not.toHaveBeenCalled();
  });

  it.each([
    [204, true],
    [200, true],
    [299, true],
  ] as const)('treats HTTP %s as success', async (status, shouldSucceed) => {
    const publisher = new WebhookProvisioningEventPublisher(
      [{ url: 'https://example.test/hook' }],
      secretProvider,
      { fetchImplementation: vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status })) },
    );
    if (shouldSucceed) {
      await expect(publisher.publish(buildEvent())).resolves.toBeUndefined();
    }
  });

  it('retries a temporary (5xx) failure and eventually succeeds', async () => {
    const fetchImplementation = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    const publisher = new WebhookProvisioningEventPublisher(
      [{ url: 'https://example.test/hook' }],
      secretProvider,
      { baseRetryDelayMs: 1, fetchImplementation, maxAttemptsPerEndpoint: 3 },
    );

    await expect(publisher.publish(buildEvent())).resolves.toBeUndefined();
    expect(fetchImplementation).toHaveBeenCalledTimes(2);
  });

  it('does not retry a permanent (4xx, non-429/408/425) failure', async () => {
    const fetchImplementation = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 400 }));
    const publisher = new WebhookProvisioningEventPublisher(
      [{ url: 'https://example.test/hook' }],
      secretProvider,
      { baseRetryDelayMs: 1, fetchImplementation, maxAttemptsPerEndpoint: 3 },
    );

    await expect(publisher.publish(buildEvent())).rejects.toThrow();
    expect(fetchImplementation).toHaveBeenCalledTimes(1);
  });

  it('stops retrying once maxAttemptsPerEndpoint is exhausted', async () => {
    const fetchImplementation = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 500 }));
    const publisher = new WebhookProvisioningEventPublisher(
      [{ url: 'https://example.test/hook' }],
      secretProvider,
      { baseRetryDelayMs: 1, fetchImplementation, maxAttemptsPerEndpoint: 3 },
    );

    await expect(publisher.publish(buildEvent())).rejects.toThrow();
    expect(fetchImplementation).toHaveBeenCalledTimes(3);
  });

  it('classifies a network error as retryable', async () => {
    const fetchImplementation = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new TypeError('connection refused'))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    const publisher = new WebhookProvisioningEventPublisher(
      [{ url: 'https://example.test/hook' }],
      secretProvider,
      { baseRetryDelayMs: 1, fetchImplementation, maxAttemptsPerEndpoint: 3 },
    );

    await expect(publisher.publish(buildEvent())).resolves.toBeUndefined();
    expect(fetchImplementation).toHaveBeenCalledTimes(2);
  });

  it('aborts and treats a timeout as retryable', async () => {
    const fetchImplementation = vi.fn<typeof fetch>().mockImplementation(
      (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    );
    const publisher = new WebhookProvisioningEventPublisher(
      [{ url: 'https://example.test/hook' }],
      secretProvider,
      { baseRetryDelayMs: 1, fetchImplementation, maxAttemptsPerEndpoint: 1, timeoutMs: 100 },
    );

    await expect(publisher.publish(buildEvent())).rejects.toThrow(/tiempo máximo/);
  });

  it('delivers to multiple endpoints and only fails if at least one ultimately fails', async () => {
    const okFetch = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 200 }));
    const failingFetch = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 400 }));
    const combinedFetch = vi.fn<typeof fetch>().mockImplementation((url, init) =>
      String(url).includes('good') ? okFetch(url, init) : failingFetch(url, init),
    );
    const publisher = new WebhookProvisioningEventPublisher(
      [{ url: 'https://good.example.test/hook' }, { url: 'https://bad.example.test/hook' }],
      secretProvider,
      { baseRetryDelayMs: 1, fetchImplementation: combinedFetch },
    );

    await expect(publisher.publish(buildEvent())).rejects.toThrow(/1\/2 endpoint/);
    expect(okFetch).toHaveBeenCalledTimes(1);
    expect(failingFetch).toHaveBeenCalledTimes(1);
  });

  it('succeeds when every configured endpoint succeeds', async () => {
    const fetchImplementation = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 200 }));
    const publisher = new WebhookProvisioningEventPublisher(
      [{ url: 'https://one.example.test/hook' }, { url: 'https://two.example.test/hook' }],
      secretProvider,
      { fetchImplementation },
    );

    await expect(publisher.publish(buildEvent())).resolves.toBeUndefined();
    expect(fetchImplementation).toHaveBeenCalledTimes(2);
  });
});
