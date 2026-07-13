import type { ConsumedDomainEventDto } from '../../dto/automation/consumed-domain-event.dto.js';
import type { EvaluationContext } from '../../../domain/automation/value-objects/evaluation-context.js';
export interface AutomationFactsPort {
  buildContexts(event: ConsumedDomainEventDto): Promise<readonly EvaluationContext[]>;
}
