export interface NetworkOperationFailedEventProps {
  aggregateId: string;
  attemptCount: number;
  causationId: string;
  companyId: string;
  correlationId: string;
  errorCode: string;
  eventId: string;
  occurredAt: Date;
  serviceId: string;
}

export class NetworkOperationFailedEvent {
  public readonly aggregateType = 'ProvisioningOperation';
  public readonly eventType = 'NetworkOperationFailed.v1';
  public readonly schemaVersion = 1;
  public readonly aggregateId: string;
  public readonly causationId: string;
  public readonly correlationId: string;
  public readonly eventId: string;
  public readonly occurredAt: string;
  public readonly payload: Readonly<{
    attemptCount: number;
    companyId: string;
    errorCode: string;
    operationId: string;
    serviceId: string;
  }>;

  public constructor(props: NetworkOperationFailedEventProps) {
    this.aggregateId = props.aggregateId;
    this.causationId = props.causationId;
    this.correlationId = props.correlationId;
    this.eventId = props.eventId;
    this.occurredAt = props.occurredAt.toISOString();
    this.payload = Object.freeze({
      attemptCount: props.attemptCount,
      companyId: props.companyId,
      errorCode: props.errorCode,
      operationId: props.aggregateId,
      serviceId: props.serviceId,
    });
  }
}
