export interface ProvisioningOperationQueuedEventProps {
  aggregateId: string;
  causationId: string;
  companyId: string;
  correlationId: string;
  eventId: string;
  occurredAt: Date;
  serviceId: string;
}

export class ProvisioningOperationQueuedEvent {
  public readonly aggregateType = 'ProvisioningOperation';
  public readonly eventType = 'ProvisioningOperationQueued.v1';
  public readonly schemaVersion = 1;
  public readonly aggregateId: string;
  public readonly causationId: string;
  public readonly correlationId: string;
  public readonly eventId: string;
  public readonly occurredAt: string;
  public readonly payload: Readonly<{ companyId: string; operationId: string; serviceId: string }>;

  public constructor(props: ProvisioningOperationQueuedEventProps) {
    this.aggregateId = props.aggregateId;
    this.causationId = props.causationId;
    this.correlationId = props.correlationId;
    this.eventId = props.eventId;
    this.occurredAt = props.occurredAt.toISOString();
    this.payload = Object.freeze({
      companyId: props.companyId,
      operationId: props.aggregateId,
      serviceId: props.serviceId,
    });
  }
}
