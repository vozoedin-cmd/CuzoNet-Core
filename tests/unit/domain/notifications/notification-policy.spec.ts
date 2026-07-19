import { describe, expect, it } from 'vitest';

import { NotificationDestination } from '../../../../backend/domain/notifications/notification-destination.js';
import { NotificationPolicy } from '../../../../backend/domain/notifications/notification-policy.js';

const now = new Date('2026-07-18T12:00:00.000Z');
function destination(
  overrides: Partial<Parameters<typeof NotificationDestination.create>[0]> = {},
) {
  return NotificationDestination.create({
    channel: 'webhook',
    companyId: 'company-1',
    configurationReference: 'WEBHOOK_OPERATIONS',
    createdAt: now,
    enabled: true,
    eventTypes: ['incident_opened', 'incident_acknowledged', 'incident_resolved'],
    id: 'destination-1',
    name: 'Operations',
    updatedAt: now,
    ...overrides,
  });
}
function event(
  eventType: 'IncidentOpened.v1' | 'IncidentAcknowledged.v1' | 'IncidentResolved.v1',
  severity: 'info' | 'warning' | 'major' | 'critical' = 'critical',
) {
  return {
    companyId: 'company-1',
    equipmentId: 'equipment-1',
    eventId: 'event-1',
    eventType,
    incidentId: 'incident-1',
    occurredAt: now.toISOString(),
    ruleId: 'rule-1',
    severity,
  } as const;
}

describe('NotificationPolicy', () => {
  it.each([
    ['critical', 'urgent'],
    ['major', 'high'],
    ['warning', 'normal'],
    ['info', 'low'],
  ] as const)('maps opened %s to %s', (severity, priority) => {
    expect(
      new NotificationPolicy().select(event('IncidentOpened.v1', severity), [destination()])[0],
    ).toMatchObject({ priority, templateCode: 'incident-opened' });
  });

  it.each(['IncidentAcknowledged.v1', 'IncidentResolved.v1'] as const)(
    'uses normal priority for %s',
    (eventType) => {
      expect(new NotificationPolicy().select(event(eventType), [destination()])[0]?.priority).toBe(
        'normal',
      );
    },
  );

  it('filters disabled, unsubscribed, insufficient severity and other tenants', () => {
    const policy = new NotificationPolicy();
    expect(
      policy.select(event('IncidentOpened.v1', 'warning'), [destination({ enabled: false })]),
    ).toHaveLength(0);
    expect(
      policy.select(event('IncidentOpened.v1'), [
        destination({ eventTypes: ['incident_resolved'] }),
      ]),
    ).toHaveLength(0);
    expect(
      policy.select(event('IncidentOpened.v1', 'warning'), [
        destination({ minimumSeverity: 'major' }),
      ]),
    ).toHaveLength(0);
    expect(
      policy.select(event('IncidentOpened.v1'), [destination({ companyId: 'company-2' })]),
    ).toHaveLength(0);
  });
});
