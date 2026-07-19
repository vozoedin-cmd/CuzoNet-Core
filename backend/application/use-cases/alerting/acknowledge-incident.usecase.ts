import type { Clock } from '../../ports/clock.port.js';
import type { Incident } from '../../../domain/alerting/incident.js';
import type { IncidentEngine } from './incident-engine.js';

export interface AcknowledgeIncidentCommand {
  readonly acknowledgedBy: string;
  readonly companyId: string;
  readonly correlationId: string;
  readonly incidentId: string;
}

export class AcknowledgeIncidentUseCase {
  public constructor(
    private readonly engine: IncidentEngine,
    private readonly clock: Clock,
  ) {}

  public execute(command: AcknowledgeIncidentCommand): Promise<Incident> {
    return this.engine.acknowledge({
      acknowledgedBy: command.acknowledgedBy,
      causationId: command.correlationId,
      companyId: command.companyId,
      correlationId: command.correlationId,
      incidentId: command.incidentId,
      occurredAt: this.clock.now(),
    });
  }
}
