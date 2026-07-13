import { describe, expect, it } from 'vitest';

import { parseConsumedDomainEvent } from '../../../../backend/application/contracts/automation/consumed-event-parser.js';

const envelope = {
  aggregateId: 'aggregate-one',
  aggregateType: 'Aggregate',
  causationId: 'causation-one',
  companyId: 'company-one',
  correlationId: 'correlation-one',
  eventId: 'event-one',
  occurredAt: '2026-07-12T10:00:00.000Z',
  payload: {},
  schemaVersion: 1,
};

describe('Automation consumed event contract', () => {
  it.each([
    'ClientCreated.v1',
    'PlanVersionCreated.v1',
    'PaymentRecorded.v1',
    'ServiceSuspended.v1',
    'ServiceReactivated.v1',
    'NetworkOperationFailed.v1',
  ])('acepta el evento aprobado %s', (eventType) => {
    expect(parseConsumedDomainEvent({ ...envelope, eventType }).eventType).toBe(eventType);
  });

  it('rechaza eventos que no pertenecen al catálogo consumido', () => {
    expect(() =>
      parseConsumedDomainEvent({ ...envelope, eventType: 'ServiceCreated.v1' }),
    ).toThrowError(expect.objectContaining({ code: 'UNSUPPORTED_AUTOMATION_EVENT' }));
  });
});
