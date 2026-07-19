import { afterEach, describe, expect, it, vi } from 'vitest';

import { NotificationDestination } from '../../../../backend/domain/notifications/notification-destination.js';
import { WebhookNotificationChannel } from '../../../../backend/infrastructure/notifications/webhook-notification.channel.js';

const now = new Date('2026-07-18T12:00:00.000Z');
const destination = NotificationDestination.create({
  channel: 'webhook',
  companyId: 'company-1',
  configurationReference: 'WEBHOOK_OPERATIONS',
  createdAt: now,
  enabled: true,
  eventTypes: ['incident_opened'],
  id: 'destination-1',
  name: 'Operations',
  updatedAt: now,
});
const rendered = { structuredPayload: { eventId: 'event-1' }, text: 'safe' };

afterEach(() => vi.useRealTimers());

describe('WebhookNotificationChannel', () => {
  it('posts JSON without following redirects and supports bearer credentials', async () => {
    const fetchImplementation = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(null, { status: 204 }));
    const channel = new WebhookNotificationChannel({ fetchImplementation });
    await expect(
      channel.send({
        credentials: {
          bearerToken: 'secret-value',
          channel: 'webhook',
          url: 'https://example.test/hook',
        },
        destination,
        rendered,
      }),
    ).resolves.toMatchObject({ responseCode: 204, type: 'success' });
    expect(fetchImplementation).toHaveBeenCalledWith(
      'https://example.test/hook',
      expect.objectContaining({ method: 'POST', redirect: 'manual' }),
    );
  });

  it.each([
    [500, 'retryableFailure'],
    [429, 'retryableFailure'],
    [400, 'permanentFailure'],
    [401, 'permanentFailure'],
  ] as const)('classifies HTTP %s as %s', async (status, type) => {
    const channel = new WebhookNotificationChannel({
      fetchImplementation: vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status })),
    });
    await expect(
      channel.send({
        credentials: { channel: 'webhook', url: 'https://example.test/hook' },
        destination,
        rendered,
      }),
    ).resolves.toMatchObject({ responseCode: status, type });
  });

  it('blocks invalid, credential-bearing and HTTP URLs by default', async () => {
    const channel = new WebhookNotificationChannel({ fetchImplementation: vi.fn<typeof fetch>() });
    for (const url of ['not-a-url', 'https://user:pass@example.test', 'http://example.test']) {
      await expect(
        channel.send({ credentials: { channel: 'webhook', url }, destination, rendered }),
      ).resolves.toMatchObject({ type: 'permanentFailure' });
    }
  });

  it('classifies connection failures and timeouts as retryable', async () => {
    const network = new WebhookNotificationChannel({
      fetchImplementation: vi
        .fn<typeof fetch>()
        .mockRejectedValue(new TypeError('connection refused')),
    });
    await expect(
      network.send({
        credentials: { channel: 'webhook', url: 'https://example.test' },
        destination,
        rendered,
      }),
    ).resolves.toMatchObject({ errorCode: 'NETWORK_ERROR', type: 'retryableFailure' });

    vi.useFakeTimers();
    const fetchImplementation = vi.fn<typeof fetch>().mockImplementation(
      (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    );
    const timeout = new WebhookNotificationChannel({ fetchImplementation, timeoutMs: 100 });
    const pending = timeout.send({
      credentials: { channel: 'webhook', url: 'https://example.test' },
      destination,
      rendered,
    });
    await vi.advanceTimersByTimeAsync(100);
    await expect(pending).resolves.toMatchObject({
      errorCode: 'TIMEOUT',
      type: 'retryableFailure',
    });
  });
});
