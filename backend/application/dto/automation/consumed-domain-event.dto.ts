import type { AutomationEventType } from '../../../domain/automation/value-objects/event-trigger.js';
export interface ConsumedDomainEventDto {
  aggregateId: string;
  aggregateType: string;
  causationId: string;
  companyId: string;
  correlationId: string;
  eventId: string;
  eventType: AutomationEventType;
  occurredAt: string;
  payload: Readonly<Record<string, unknown>>;
  schemaVersion: 1;
}
