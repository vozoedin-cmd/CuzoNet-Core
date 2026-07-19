import type { IdGenerator } from '../../ports/id-generator.port.js';
import type {
  IncidentOutboxPort,
  IncidentUnitOfWork,
} from '../../ports/alerting/incident-outbox.port.js';
import type {
  IncidentEventRepository,
  IncidentRepository,
} from '../../ports/alerting/incident-repositories.js';
import type { AlertDecision } from '../../../domain/alerting/alert-decision.js';
import type { AlertRule } from '../../../domain/alerting/alert-rule.js';
import { IncidentNotFoundError } from '../../../domain/alerting/errors/incident-not-found.error.js';
import { IncidentStateConflictError } from '../../../domain/alerting/errors/incident-state-conflict.error.js';
import { Incident } from '../../../domain/alerting/incident.js';

export interface ApplyIncidentDecisionInput {
  readonly causationId: string;
  readonly companyId: string;
  readonly decision: AlertDecision;
  readonly equipmentId: string;
  readonly observedAt: Date;
  readonly rule: AlertRule;
  readonly value?: number;
}

export interface AcknowledgeIncidentEngineInput {
  readonly acknowledgedBy: string;
  readonly causationId: string;
  readonly companyId: string;
  readonly correlationId: string;
  readonly incidentId: string;
  readonly occurredAt: Date;
}

export class IncidentEngine {
  public constructor(
    private readonly incidentRepository: IncidentRepository,
    private readonly eventRepository: IncidentEventRepository,
    private readonly outbox: IncidentOutboxPort,
    private readonly unitOfWork: IncidentUnitOfWork,
    private readonly idGenerator: IdGenerator,
  ) {}

  public async apply(input: ApplyIncidentDecisionInput): Promise<Incident | null> {
    if (input.decision.type === 'ignore') return null;
    const correlationKey = buildIncidentCorrelationKey(
      input.companyId,
      input.rule.props.id,
      input.equipmentId,
    );
    const active = await this.incidentRepository.findActiveByCorrelationKey(
      input.companyId,
      correlationKey,
    );

    if (input.decision.type === 'keepOpen') {
      if (active === null) return null;
      active.markEvaluated(input.observedAt);
      await this.incidentRepository.save(active);
      return active;
    }

    if (input.decision.type === 'trigger') {
      if (active !== null) {
        active.reconfirm(this.idGenerator.generate(), input.observedAt, input.value);
        await this.persist(active);
        return active;
      }
      return this.open({ ...input, correlationKey });
    }

    if (active === null) return null;
    active.resolve(
      this.eventMetadata(input.causationId, correlationKey),
      input.observedAt,
      input.value,
    );
    await this.persist(active);
    return active;
  }

  public async acknowledge(input: AcknowledgeIncidentEngineInput): Promise<Incident> {
    const incident = await this.incidentRepository.findById(input.companyId, input.incidentId);
    if (incident === null) throw new IncidentNotFoundError();
    try {
      incident.acknowledge(
        this.eventMetadata(input.causationId, input.correlationId),
        input.acknowledgedBy,
        input.occurredAt,
      );
    } catch (error) {
      throw new IncidentStateConflictError(error instanceof Error ? error.message : undefined);
    }
    await this.persist(incident);
    return incident;
  }

  private async open(
    input: ApplyIncidentDecisionInput & { readonly correlationKey: string },
  ): Promise<Incident> {
    const incident = Incident.open({
      causationId: input.causationId,
      companyId: input.companyId,
      correlationId: input.correlationKey,
      correlationKey: input.correlationKey,
      domainEventId: this.idGenerator.generate(),
      equipmentId: input.equipmentId,
      eventId: this.idGenerator.generate(),
      id: this.idGenerator.generate(),
      openedAt: input.observedAt,
      ruleId: input.rule.props.id,
      severity: input.rule.props.severity,
      title: `${input.rule.props.name}: ${input.equipmentId}`,
      ...(input.value === undefined ? {} : { value: input.value }),
    });
    await this.persist(incident);
    return incident;
  }

  private eventMetadata(
    causationId: string,
    correlationId: string,
  ): {
    causationId: string;
    correlationId: string;
    domainEventId: string;
    eventId: string;
  } {
    return {
      causationId,
      correlationId,
      domainEventId: this.idGenerator.generate(),
      eventId: this.idGenerator.generate(),
    };
  }

  private async persist(incident: Incident): Promise<void> {
    const events = incident.pullIncidentEvents();
    const domainEvents = incident.pullDomainEvents();
    await this.unitOfWork.execute(async () => {
      await this.incidentRepository.save(incident);
      await this.eventRepository.append(events);
      await this.outbox.append(domainEvents);
    });
  }
}

export function buildIncidentCorrelationKey(
  companyId: string,
  ruleId: string,
  equipmentId: string,
): string {
  return `${companyId}:${ruleId}:${equipmentId}`;
}
