import { describe, expect, it } from 'vitest';

import { Notification } from '../../../../backend/domain/notifications/notification.js';

const now = new Date('2026-07-18T12:00:00.000Z');

function notification() {
  return Notification.create({
    channel: 'webhook',
    companyId: 'company-1',
    createdAt: now,
    destinationId: 'destination-1',
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
}

describe('Notification', () => {
  it('creates pending with deterministic idempotency key', () => {
    const value = notification();
    expect(value.props.status).toBe('pending');
    expect(value.props.idempotencyKey).toBe('company-1:event-1:webhook:destination-1');
  });

  it('transitions pending -> processing -> sent', () => {
    const value = notification();
    value.claim(now, 'worker-1', new Date(now.getTime() + 60_000));
    expect(value.beginAttempt(now, 'worker-1')).toBe(1);
    value.markSent(new Date(now.getTime() + 1_000), 'worker-1');
    expect(value.props.status).toBe('sent');
    expect(value.props.sentAt?.toISOString()).toBe('2026-07-18T12:00:01.000Z');
  });

  it('transitions processing -> retrying and preserves exact attempt count', () => {
    const value = notification();
    value.claim(now, 'worker-1', new Date(now.getTime() + 60_000));
    value.beginAttempt(now, 'worker-1');
    const retryAt = new Date(now.getTime() + 30_000);
    value.markRetrying('HTTP 500\nsecret stack omitted', retryAt, now, 'worker-1');
    expect(value.props.status).toBe('retrying');
    expect(value.props.scheduledAt).toEqual(retryAt);
    expect(value.props.lastError).not.toContain('\n');
  });

  it('transitions processing -> failed for a permanent error', () => {
    const value = notification();
    value.claim(now, 'worker-1', new Date(now.getTime() + 60_000));
    value.beginAttempt(now, 'worker-1');
    value.markFailed('HTTP 400', false, now, 'worker-1');
    expect(value.props.status).toBe('failed');
    expect(() => value.scheduleManualRetry(now)).toThrow('permanentes');
  });

  it('cancels before dispatch and rejects invalid transitions', () => {
    const value = notification();
    value.cancel('operator request', now);
    expect(value.props.status).toBe('cancelled');
    expect(() => value.cancel(undefined, now)).toThrow();
  });

  it('recovers an expired processing lease but not a live lease', () => {
    const value = notification();
    value.claim(now, 'worker-1', new Date(now.getTime() + 10_000));
    expect(() =>
      value.claim(new Date(now.getTime() + 5_000), 'worker-2', new Date(now.getTime() + 20_000)),
    ).toThrow();
    value.claim(new Date(now.getTime() + 10_000), 'worker-2', new Date(now.getTime() + 70_000));
    expect(value.props.processingWorkerId).toBe('worker-2');
  });

  it('rejects payload from another company', () => {
    const value = notification();
    expect(() =>
      Notification.create({
        ...value.props,
        id: 'notification-2',
        payload: { ...value.props.payload, companyId: 'company-2' },
      }),
    ).toThrow('misma compañía');
  });
});
