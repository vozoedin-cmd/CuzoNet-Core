import type { ServiceTypeValue } from '../value-objects/service-type.js';

export interface ServiceCreatedEventProps {
  aggregateId: string;
  billingDay: number;
  causationId: string;
  clientId: string;
  companyId: string;
  correlationId: string;
  eventId: string;
  occurredAt: Date;
  planVersionId: string;
  serviceType: ServiceTypeValue;
}

export class ServiceCreatedEvent {
  public readonly aggregateType = 'Service';
  public readonly eventType = 'ServiceCreated.v1';
  public readonly schemaVersion = 1;
  public readonly aggregateId: string;
  public readonly causationId: string;
  public readonly correlationId: string;
  public readonly eventId: string;
  public readonly occurredAt: string;
  public readonly payload: Readonly<{
    billingDay: number;
    clientId: string;
    companyId: string;
    planVersionId: string;
    serviceId: string;
    serviceType: ServiceTypeValue;
  }>;

  public constructor(props: ServiceCreatedEventProps) {
    this.aggregateId = props.aggregateId;
    this.causationId = props.causationId;
    this.correlationId = props.correlationId;
    this.eventId = props.eventId;
    this.occurredAt = props.occurredAt.toISOString();
    this.payload = Object.freeze({
      billingDay: props.billingDay,
      clientId: props.clientId,
      companyId: props.companyId,
      planVersionId: props.planVersionId,
      serviceId: props.aggregateId,
      serviceType: props.serviceType,
    });
  }
}
