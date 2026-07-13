import type { ConsumedDomainEventDto } from '../../dto/automation/consumed-domain-event.dto.js';
import { InvalidAutomationRuleError } from '../../../domain/automation/errors/invalid-automation-rule.error.js';
import { EventTrigger } from '../../../domain/automation/value-objects/event-trigger.js';
export function parseConsumedDomainEvent(input: unknown): ConsumedDomainEventDto {
  if (typeof input !== 'object' || input === null)
    throw new InvalidAutomationRuleError('event', 'Envelope inválido.');
  const value = input as Record<string, unknown>;
  const requiredStrings = [
    'aggregateId',
    'aggregateType',
    'causationId',
    'companyId',
    'correlationId',
    'eventId',
    'eventType',
    'occurredAt',
  ] as const;
  for (const field of requiredStrings)
    if (typeof value[field] !== 'string' || value[field].length === 0)
      throw new InvalidAutomationRuleError(`event.${field}`, 'Campo requerido.');
  const trigger = EventTrigger.create(value.eventType as string, value.schemaVersion as number);
  if (typeof value.payload !== 'object' || value.payload === null || Array.isArray(value.payload))
    throw new InvalidAutomationRuleError('event.payload', 'Payload inválido.');
  const occurredAt = new Date(value.occurredAt as string);
  if (Number.isNaN(occurredAt.getTime()))
    throw new InvalidAutomationRuleError('event.occurredAt', 'Timestamp inválido.');
  return {
    aggregateId: value.aggregateId as string,
    aggregateType: value.aggregateType as string,
    causationId: value.causationId as string,
    companyId: value.companyId as string,
    correlationId: value.correlationId as string,
    eventId: value.eventId as string,
    eventType: trigger.eventType,
    occurredAt: occurredAt.toISOString(),
    payload: Object.freeze({ ...(value.payload as Record<string, unknown>) }),
    schemaVersion: 1,
  };
}
