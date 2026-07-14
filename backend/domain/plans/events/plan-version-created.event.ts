export interface PlanVersionCreatedEventProps {
  aggregateId: string;
  causationId: string;
  companyId: string;
  correlationId: string;
  eventId: string;
  occurredAt: Date;
  planVersionId: string;
}

export class PlanVersionCreatedEvent {
  public readonly aggregateType = 'Plan';
  public readonly eventType = 'PlanVersionCreated.v1';
  public readonly schemaVersion = 1;
  public readonly aggregateId: string;
  public readonly causationId: string;
  public readonly correlationId: string;
  public readonly eventId: string;
  public readonly occurredAt: string;
  public readonly payload: Readonly<{ companyId: string; planVersionId: string }>;

  public constructor(props: PlanVersionCreatedEventProps) {
    this.aggregateId = props.aggregateId;
    this.causationId = props.causationId;
    this.correlationId = props.correlationId;
    this.eventId = props.eventId;
    this.occurredAt = props.occurredAt.toISOString();
    this.payload = Object.freeze({
      companyId: props.companyId,
      planVersionId: props.planVersionId,
    });
  }
}
