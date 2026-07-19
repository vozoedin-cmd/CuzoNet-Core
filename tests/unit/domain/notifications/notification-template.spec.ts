import { describe, expect, it } from 'vitest';

import { NotificationTemplateRenderer } from '../../../../backend/domain/notifications/notification-template.js';

const event = {
  companyId: 'company-1',
  equipmentId: 'equipment-1',
  eventId: 'event-1',
  eventType: 'IncidentOpened.v1' as const,
  incidentId: 'incident-1',
  occurredAt: '2026-07-18T12:00:00.000Z',
  ruleId: 'rule-1',
  severity: 'critical' as const,
};

describe('NotificationTemplateRenderer', () => {
  it.each([
    ['incident-opened', 'INCIDENT OPENED'],
    ['incident-acknowledged', 'INCIDENT ACKNOWLEDGED'],
    ['incident-resolved', 'INCIDENT RESOLVED'],
  ])('renders code-backed template %s', (templateCode, heading) => {
    const rendered = new NotificationTemplateRenderer().render({
      channel: 'webhook',
      event,
      notificationId: 'notification-1',
      priority: 'urgent',
      templateCode,
    });
    expect(rendered.subject).toBe(heading);
    expect(rendered.text).toContain('equipment-1');
    expect(rendered.text).toContain('incident-1');
    expect(JSON.stringify(rendered)).not.toMatch(/password|token|community/i);
  });

  it('rejects an unknown template', () => {
    expect(() =>
      new NotificationTemplateRenderer().render({
        channel: 'email',
        event,
        notificationId: 'notification-1',
        priority: 'normal',
        templateCode: 'unknown',
      }),
    ).toThrow('no soportada');
  });
});
