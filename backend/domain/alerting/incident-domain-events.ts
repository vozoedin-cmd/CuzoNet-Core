import type { AlertSeverity } from './incident-types.js';

interface IncidentDomainEventProps {
  aggregateId: string;
  causationId: string;
  companyId: string;
  correlationId: string;
  equipmentId: string;
  eventId: string;
  occurredAt: Date;
  ruleId: string;
  severity: AlertSeverity;
}

interface IncidentEventPayload {
  companyId: string;
  equipmentId: string;
  eventId: string;
  incidentId: string;
  occurredAt: string;
  ruleId: string;
  severity: AlertSeverity;
}

abstract class IncidentDomainEventBase {
  public readonly aggregateType = 'Incident';
  public readonly schemaVersion = 1;
  public readonly aggregateId: string;
  public readonly causationId: string;
  public readonly correlationId: string;
  public readonly eventId: string;
  public readonly occurredAt: string;
  public readonly payload: Readonly<IncidentEventPayload>;
  public abstract readonly eventType: string;

  protected constructor(props: IncidentDomainEventProps) {
    this.aggregateId = props.aggregateId;
    this.causationId = props.causationId;
    this.correlationId = props.correlationId;
    this.eventId = props.eventId;
    this.occurredAt = props.occurredAt.toISOString();
    this.payload = Object.freeze({
      companyId: props.companyId,
      equipmentId: props.equipmentId,
      eventId: props.eventId,
      incidentId: props.aggregateId,
      occurredAt: this.occurredAt,
      ruleId: props.ruleId,
      severity: props.severity,
    });
  }
}

export class IncidentOpenedEvent extends IncidentDomainEventBase {
  public readonly eventType = 'IncidentOpened.v1';

  public constructor(props: IncidentDomainEventProps) {
    super(props);
  }
}

export class IncidentAcknowledgedEvent extends IncidentDomainEventBase {
  public readonly eventType = 'IncidentAcknowledged.v1';

  public constructor(props: IncidentDomainEventProps) {
    super(props);
  }
}

export class IncidentResolvedEvent extends IncidentDomainEventBase {
  public readonly eventType = 'IncidentResolved.v1';

  public constructor(props: IncidentDomainEventProps) {
    super(props);
  }
}

export type IncidentDomainEvent =
  IncidentOpenedEvent | IncidentAcknowledgedEvent | IncidentResolvedEvent;
