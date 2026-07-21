import type { ProvisioningEventPayload } from './provisioning-event-payload.js';

export interface ProvisioningRetryScheduledEventProps {
  aggregateId: string;
  causationId: string;
  correlationId: string;
  eventId: string;
  occurredAt: Date;
  payload: ProvisioningEventPayload;
}

export class ProvisioningRetryScheduledEvent {
  public readonly aggregateType = 'ProvisioningRequest';
  public readonly eventType = 'ProvisioningRetryScheduled.v1';
  public readonly schemaVersion = 1;
  public readonly aggregateId: string;
  public readonly causationId: string;
  public readonly correlationId: string;
  public readonly eventId: string;
  public readonly occurredAt: string;
  public readonly payload: Readonly<ProvisioningEventPayload>;

  public constructor(props: ProvisioningRetryScheduledEventProps) {
    this.aggregateId = props.aggregateId;
    this.causationId = props.causationId;
    this.correlationId = props.correlationId;
    this.eventId = props.eventId;
    this.occurredAt = props.occurredAt.toISOString();
    this.payload = Object.freeze({ ...props.payload });
  }
}
