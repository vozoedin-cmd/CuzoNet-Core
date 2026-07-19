import { describe, expect, it } from 'vitest';

import type { NotificationCredentialProvider } from '../../../../backend/application/ports/notifications/channels.js';
import {
  NotificationChannelRegistry,
  NotificationDispatcher,
} from '../../../../backend/application/use-cases/notifications/notification-dispatcher.js';
import { Notification } from '../../../../backend/domain/notifications/notification.js';
import { NotificationDestination } from '../../../../backend/domain/notifications/notification-destination.js';
import { NotificationTemplateRenderer } from '../../../../backend/domain/notifications/notification-template.js';
import { FakeNotificationChannel } from '../../../../backend/infrastructure/notifications/fake-channel-adapter.js';

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
const notification = Notification.create({
  channel: 'webhook',
  companyId: 'company-1',
  createdAt: now,
  destinationId: destination.props.id,
  id: 'notification-1',
  incidentId: 'incident-1',
  maxAttempts: 5,
  payload: {
    companyId: 'company-1',
    equipmentId: 'equipment-1',
    eventId: 'event-1',
    eventType: 'IncidentOpened.v1',
    incidentId: 'incident-1',
    occurredAt: now.toISOString(),
    ruleId: 'rule-1',
    severity: 'critical',
  },
  priority: 'urgent',
  scheduledAt: now,
  sourceEventId: 'event-1',
  sourceEventType: 'incident_opened',
  templateCode: 'incident-opened',
});

function dispatcher(
  channel = new FakeNotificationChannel('webhook'),
  credentials: NotificationCredentialProvider = {
    get: () => Promise.resolve({ channel: 'webhook', url: 'https://example.test/hook' }),
  },
) {
  return new NotificationDispatcher(
    new NotificationChannelRegistry([channel]),
    new NotificationTemplateRenderer(),
    credentials,
  );
}

describe('NotificationDispatcher', () => {
  it('resolves the correct channel and returns success', async () => {
    const channel = new FakeNotificationChannel('webhook');
    await expect(dispatcher(channel).dispatch(notification, destination)).resolves.toMatchObject({
      type: 'success',
    });
    expect(channel.sent).toHaveLength(1);
  });

  it('returns permanent failure for absent credentials', async () => {
    await expect(
      dispatcher(undefined, { get: () => Promise.resolve(null) }).dispatch(
        notification,
        destination,
      ),
    ).resolves.toMatchObject({ errorCode: 'MISSING_CONFIGURATION', type: 'permanentFailure' });
  });

  it.each(['retryableFailure', 'permanentFailure'] as const)(
    'preserves channel %s classification',
    async (type) => {
      const channel = new FakeNotificationChannel('webhook', {
        errorCode: 'TEST',
        errorMessage: 'safe',
        type,
      });
      await expect(dispatcher(channel).dispatch(notification, destination)).resolves.toMatchObject({
        type,
      });
    },
  );

  it('rejects missing destination and unregistered channel permanently', async () => {
    await expect(dispatcher().dispatch(notification, null)).resolves.toMatchObject({
      type: 'permanentFailure',
    });
    const registry = new NotificationDispatcher(
      new NotificationChannelRegistry([]),
      new NotificationTemplateRenderer(),
      { get: () => Promise.resolve(null) },
    );
    await expect(registry.dispatch(notification, destination)).resolves.toMatchObject({
      errorCode: 'CHANNEL_NOT_REGISTERED',
    });
  });
});
