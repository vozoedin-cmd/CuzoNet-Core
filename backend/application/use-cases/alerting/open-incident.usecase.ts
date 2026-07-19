import type { AlertDecision } from '../../../domain/alerting/alert-decision.js';
import type { AlertRule } from '../../../domain/alerting/alert-rule.js';
import type { Incident } from '../../../domain/alerting/incident.js';
import type { IncidentEngine } from './incident-engine.js';

export interface OpenIncidentCommand {
  readonly causationId: string;
  readonly companyId: string;
  readonly decision?: AlertDecision;
  readonly equipmentId: string;
  readonly occurredAt: Date;
  readonly rule: AlertRule;
  readonly value?: number;
}

export class OpenIncidentUseCase {
  public constructor(private readonly engine: IncidentEngine) {}

  public execute(command: OpenIncidentCommand): Promise<Incident | null> {
    return this.engine.apply({
      causationId: command.causationId,
      companyId: command.companyId,
      decision: command.decision ?? { type: 'trigger' },
      equipmentId: command.equipmentId,
      observedAt: command.occurredAt,
      rule: command.rule,
      ...(command.value === undefined ? {} : { value: command.value }),
    });
  }
}
