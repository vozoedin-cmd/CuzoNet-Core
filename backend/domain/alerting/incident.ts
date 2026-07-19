import {
  IncidentAcknowledgedEvent,
  type IncidentDomainEvent,
  IncidentOpenedEvent,
  IncidentResolvedEvent,
} from './incident-domain-events.js';
import { IncidentEvent } from './incident-event.js';
import type { AlertSeverity, IncidentStatus } from './incident-types.js';

export interface IncidentProps {
  acknowledgedAt?: Date;
  acknowledgedBy?: string;
  readonly companyId: string;
  readonly correlationKey: string;
  readonly createdAt: Date;
  durationSeconds?: number;
  readonly equipmentId: string;
  readonly id: string;
  lastEvaluatedAt: Date;
  lastTriggeredAt: Date;
  readonly openedAt: Date;
  resolvedAt?: Date;
  readonly ruleId: string;
  readonly severity: AlertSeverity;
  status: IncidentStatus;
  readonly title: string;
  updatedAt: Date;
}

interface EventMetadata {
  readonly causationId: string;
  readonly correlationId: string;
  readonly domainEventId: string;
  readonly eventId: string;
}

export interface OpenIncidentProps extends EventMetadata {
  readonly companyId: string;
  readonly correlationKey: string;
  readonly equipmentId: string;
  readonly id: string;
  readonly openedAt: Date;
  readonly ruleId: string;
  readonly severity: AlertSeverity;
  readonly title: string;
  readonly value?: number;
}

export class Incident {
  private readonly pendingEvents: IncidentEvent[] = [];
  private readonly domainEvents: IncidentDomainEvent[] = [];

  private constructor(public readonly props: IncidentProps) {}

  public static open(props: OpenIncidentProps): Incident {
    const openedAt = validDate(props.openedAt, 'openedAt');
    const incident = new Incident({
      companyId: required(props.companyId, 'companyId'),
      correlationKey: required(props.correlationKey, 'correlationKey'),
      createdAt: openedAt,
      equipmentId: required(props.equipmentId, 'equipmentId'),
      id: required(props.id, 'id'),
      lastEvaluatedAt: openedAt,
      lastTriggeredAt: openedAt,
      openedAt,
      ruleId: required(props.ruleId, 'ruleId'),
      severity: props.severity,
      status: 'open',
      title: required(props.title, 'title'),
      updatedAt: openedAt,
    });
    incident.pendingEvents.push(
      IncidentEvent.create({
        companyId: incident.props.companyId,
        id: props.eventId,
        incidentId: incident.props.id,
        occurredAt: openedAt,
        payload: props.value === undefined ? {} : { value: finite(props.value) },
        type: 'opened',
      }),
    );
    incident.domainEvents.push(
      new IncidentOpenedEvent({
        aggregateId: incident.props.id,
        causationId: props.causationId,
        companyId: incident.props.companyId,
        correlationId: props.correlationId,
        equipmentId: incident.props.equipmentId,
        eventId: props.domainEventId,
        occurredAt: openedAt,
        ruleId: incident.props.ruleId,
        severity: incident.props.severity,
      }),
    );
    return incident;
  }

  public static reconstitute(props: IncidentProps): Incident {
    return new Incident({
      ...props,
      ...(props.acknowledgedAt === undefined
        ? {}
        : { acknowledgedAt: validDate(props.acknowledgedAt, 'acknowledgedAt') }),
      createdAt: validDate(props.createdAt, 'createdAt'),
      lastEvaluatedAt: validDate(props.lastEvaluatedAt, 'lastEvaluatedAt'),
      lastTriggeredAt: validDate(props.lastTriggeredAt, 'lastTriggeredAt'),
      openedAt: validDate(props.openedAt, 'openedAt'),
      ...(props.resolvedAt === undefined
        ? {}
        : { resolvedAt: validDate(props.resolvedAt, 'resolvedAt') }),
      updatedAt: validDate(props.updatedAt, 'updatedAt'),
    });
  }

  public reconfirm(eventId: string, occurredAt: Date, value?: number): void {
    this.assertActive();
    const at = this.forwardDate(occurredAt);
    this.props.lastEvaluatedAt = at;
    this.props.lastTriggeredAt = at;
    this.props.updatedAt = at;
    this.pendingEvents.push(
      IncidentEvent.create({
        companyId: this.props.companyId,
        id: eventId,
        incidentId: this.props.id,
        occurredAt: at,
        payload: value === undefined ? {} : { value: finite(value) },
        type: 'condition_reconfirmed',
      }),
    );
  }

  public markEvaluated(occurredAt: Date): void {
    if (this.props.status === 'resolved') return;
    const at = this.forwardDate(occurredAt);
    this.props.lastEvaluatedAt = at;
    this.props.updatedAt = at;
  }

  public acknowledge(metadata: EventMetadata, actorId: string, occurredAt: Date): void {
    if (this.props.status !== 'open') throw new Error('Only an open incident can be acknowledged.');
    const at = this.forwardDate(occurredAt);
    this.props.status = 'acknowledged';
    this.props.acknowledgedAt = at;
    this.props.acknowledgedBy = required(actorId, 'acknowledgedBy');
    this.props.lastEvaluatedAt = at;
    this.props.updatedAt = at;
    this.pendingEvents.push(
      IncidentEvent.create({
        companyId: this.props.companyId,
        id: metadata.eventId,
        incidentId: this.props.id,
        occurredAt: at,
        payload: { acknowledgedBy: this.props.acknowledgedBy },
        type: 'acknowledged',
      }),
    );
    this.domainEvents.push(
      new IncidentAcknowledgedEvent({
        aggregateId: this.props.id,
        causationId: metadata.causationId,
        companyId: this.props.companyId,
        correlationId: metadata.correlationId,
        equipmentId: this.props.equipmentId,
        eventId: metadata.domainEventId,
        occurredAt: at,
        ruleId: this.props.ruleId,
        severity: this.props.severity,
      }),
    );
  }

  public resolve(metadata: EventMetadata, occurredAt: Date, value?: number): void {
    this.assertActive();
    const at = this.forwardDate(occurredAt);
    this.props.status = 'resolved';
    this.props.resolvedAt = at;
    this.props.lastEvaluatedAt = at;
    this.props.updatedAt = at;
    this.props.durationSeconds = Math.max(
      0,
      Math.floor((at.getTime() - this.props.openedAt.getTime()) / 1_000),
    );
    this.pendingEvents.push(
      IncidentEvent.create({
        companyId: this.props.companyId,
        id: metadata.eventId,
        incidentId: this.props.id,
        occurredAt: at,
        payload: value === undefined ? {} : { value: finite(value) },
        type: 'resolved',
      }),
    );
    this.domainEvents.push(
      new IncidentResolvedEvent({
        aggregateId: this.props.id,
        causationId: metadata.causationId,
        companyId: this.props.companyId,
        correlationId: metadata.correlationId,
        equipmentId: this.props.equipmentId,
        eventId: metadata.domainEventId,
        occurredAt: at,
        ruleId: this.props.ruleId,
        severity: this.props.severity,
      }),
    );
  }

  public pullIncidentEvents(): readonly IncidentEvent[] {
    return this.pendingEvents.splice(0, this.pendingEvents.length);
  }

  public pullDomainEvents(): readonly IncidentDomainEvent[] {
    return this.domainEvents.splice(0, this.domainEvents.length);
  }

  private assertActive(): void {
    if (this.props.status === 'resolved') throw new Error('A resolved incident cannot transition.');
  }

  private forwardDate(value: Date): Date {
    const date = validDate(value, 'occurredAt');
    if (date < this.props.openedAt) throw new RangeError('Incident event precedes openedAt.');
    return date;
  }
}

function required(value: string, name: string): string {
  const normalized = value.trim();
  if (normalized.length === 0) throw new Error(`Incident ${name} is required.`);
  return normalized;
}

function validDate(value: Date, name: string): Date {
  if (Number.isNaN(value.getTime())) throw new RangeError(`Incident ${name} must be valid.`);
  return new Date(value);
}

function finite(value: number): number {
  if (!Number.isFinite(value)) throw new RangeError('Incident value must be finite.');
  return value;
}
