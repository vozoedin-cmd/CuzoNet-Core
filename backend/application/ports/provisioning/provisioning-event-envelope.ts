import type { ProvisioningConsumableEventType } from '../../../domain/provisioning/events/provisioning-event-types.js';

export interface ProvisioningEventEnvelope {
  aggregateId: string;
  aggregateType: string;
  causationId: string;
  companyId: string;
  correlationId: string;
  eventId: string;
  eventType: ProvisioningConsumableEventType;
  occurredAt: string;
  payload: Readonly<Record<string, unknown>>;
  schemaVersion: number;
}
