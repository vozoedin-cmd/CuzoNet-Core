import { afterEach, describe, expect, it, vi } from 'vitest';

import { NotificationDestination } from '../../../../backend/domain/notifications/notification-destination.js';
import { EvolutionApiWhatsAppNotificationChannel } from '../../../../backend/infrastructure/notifications/whatsapp-notification.channel.js';

const now = new Date('2026-07-18T12:00:00.000Z');
const destination = NotificationDestination.create({
  address: '50255555555',
  channel: 'whatsapp',
  companyId: 'company-1',
  configurationReference: 'WHATSAPP_OPERATIONS',
  createdAt: now,
  enabled: true,
  eventTypes: ['incident_opened'],
  id: 'destination-1',
  name: 'Operations',
  updatedAt: now,
});
const rendered = { text: 'safe text' };

afterEach(() => vi.useRealTimers());

describe('EvolutionApiWhatsAppNotificationChannel', () => {
  it('posts JSON without following redirects and includes apikey', async () => {
    const fetchImplementation = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(JSON.stringify({ key: { id: 'msg_123' } }), { status: 201 }));
    const channel = new EvolutionApiWhatsAppNotificationChannel({ fetchImplementation });
    await expect(
      channel.send({
        credentials: {
          apiKey: 'secret-api-key',
          baseUrl: 'https://evolution.example.com',
          channel: 'whatsapp',
          instanceName: 'test-instance',
        },
        destination,
        rendered,
      }),
    ).resolves.toMatchObject({
      responseCode: 201,
      type: 'success',
      providerMessageId: 'msg_123',
      safeMetadata: { maskedRecipient: '502*****555' },
    });
    expect(fetchImplementation).toHaveBeenCalledWith(
      'https://evolution.example.com/message/sendText/test-instance',
      expect.objectContaining({
        body: JSON.stringify({ number: '50255555555', text: 'safe text' }),
        headers: { apikey: 'secret-api-key', 'content-type': 'application/json' },
        method: 'POST',
        redirect: 'manual',
      }),
    );
  });

  it.each([
    [500, 'retryableFailure'],
    [429, 'retryableFailure'],
    [400, 'permanentFailure'],
    [401, 'permanentFailure'],
  ] as const)('classifies HTTP %s as %s', async (status, type) => {
    const channel = new EvolutionApiWhatsAppNotificationChannel({
      fetchImplementation: vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status })),
    });
    await expect(
      channel.send({
        credentials: {
          apiKey: 'key',
          baseUrl: 'https://evolution.example.com',
          channel: 'whatsapp',
          instanceName: 'inst',
        },
        destination,
        rendered,
      }),
    ).resolves.toMatchObject({ responseCode: status, type });
  });

  it('rejects invalid, credential-bearing and HTTP URLs by default', async () => {
    const channel = new EvolutionApiWhatsAppNotificationChannel({ fetchImplementation: vi.fn<typeof fetch>() });
    for (const baseUrl of ['not-a-url', 'http://evolution.example.test']) {
      await expect(
        channel.send({
          credentials: { apiKey: 'k', baseUrl, channel: 'whatsapp', instanceName: 'i' },
          destination,
          rendered,
        }),
      ).resolves.toMatchObject({ type: 'permanentFailure' });
    }
  });

  it('classifies connection failures and timeouts as retryable', async () => {
    const network = new EvolutionApiWhatsAppNotificationChannel({
      fetchImplementation: vi.fn<typeof fetch>().mockRejectedValue(new TypeError('connection refused')),
    });
    await expect(
      network.send({
        credentials: { apiKey: 'k', baseUrl: 'https://ev.test', channel: 'whatsapp', instanceName: 'i' },
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
    const timeout = new EvolutionApiWhatsAppNotificationChannel({ fetchImplementation, timeoutMs: 100 });
    const pending = timeout.send({
      credentials: { apiKey: 'k', baseUrl: 'https://ev.test', channel: 'whatsapp', instanceName: 'i' },
      destination,
      rendered,
    });
    await vi.advanceTimersByTimeAsync(100);
    await expect(pending).resolves.toMatchObject({
      errorCode: 'TIMEOUT',
      type: 'retryableFailure',
    });
  });

  it('returns permanentFailure if address is missing', async () => {
    const channel = new EvolutionApiWhatsAppNotificationChannel();
    const { address: _address, ...rest } = destination.props;
    const badDest = NotificationDestination.reconstitute(rest);
    await expect(
      channel.send({
        credentials: { apiKey: 'k', baseUrl: 'https://ev.test', channel: 'whatsapp', instanceName: 'i' },
        destination: badDest,
        rendered,
      }),
    ).resolves.toMatchObject({ errorCode: 'INVALID_DESTINATION', type: 'permanentFailure' });
  });

  it('returns permanentFailure if message exceeds maxTextLength', async () => {
    const channel = new EvolutionApiWhatsAppNotificationChannel({ maxTextLength: 10 });
    await expect(
      channel.send({
        credentials: { apiKey: 'k', baseUrl: 'https://ev.test', channel: 'whatsapp', instanceName: 'i' },
        destination,
        rendered: { text: '12345678901' },
      }),
    ).resolves.toMatchObject({ errorCode: 'MESSAGE_TOO_LONG', type: 'permanentFailure' });
  });
});
