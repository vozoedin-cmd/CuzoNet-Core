import type { ClientTypeValue } from '../value-objects/client-type.js';

export interface ClientCreatedEventProps {
  aggregateId: string;
  causationId: string;
  clientType: ClientTypeValue;
  companyId: string;
  correlationId: string;
  eventId: string;
  occurredAt: Date;
}

export class ClientCreatedEvent {
  public readonly aggregateType = 'Client';
  public readonly eventType = 'ClientCreated.v1';
  public readonly schemaVersion = 1;
  public readonly aggregateId: string;
  public readonly causationId: string;
  public readonly correlationId: string;
  public readonly eventId: string;
  public readonly occurredAt: string;
  public readonly payload: Readonly<{
    clientId: string;
    clientType: ClientTypeValue;
    companyId: string;
  }>;

  public constructor(props: ClientCreatedEventProps) {
    this.aggregateId = props.aggregateId;
    this.causationId = props.causationId;
    this.correlationId = props.correlationId;
    this.eventId = props.eventId;
    this.occurredAt = props.occurredAt.toISOString();
    this.payload = Object.freeze({
      clientId: props.aggregateId,
      clientType: props.clientType,
      companyId: props.companyId,
    });
  }
}
