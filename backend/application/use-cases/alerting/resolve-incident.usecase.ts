import type { AlertRule } from '../../../domain/alerting/alert-rule.js';
import type { Incident } from '../../../domain/alerting/incident.js';
import type { IncidentEngine } from './incident-engine.js';

export interface ResolveIncidentCommand {
  readonly causationId: string;
  readonly companyId: string;
  readonly equipmentId: string;
  readonly occurredAt: Date;
  readonly rule: AlertRule;
  readonly value?: number;
}

export class ResolveIncidentUseCase {
  public constructor(private readonly engine: IncidentEngine) {}

  public execute(command: ResolveIncidentCommand): Promise<Incident | null> {
    return this.engine.apply({
      causationId: command.causationId,
      companyId: command.companyId,
      decision: { type: 'recover' },
      equipmentId: command.equipmentId,
      observedAt: command.occurredAt,
      rule: command.rule,
      ...(command.value === undefined ? {} : { value: command.value }),
    });
  }
}
