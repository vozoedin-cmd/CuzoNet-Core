import type { AutomationExecutionDto } from '../../dto/automation/automation-execution.dto.js';
import type { AutomationExecutionStatus } from '../../../domain/automation/automation-execution.js';
export interface AutomationExecutionListCriteria {
  companyId: string;
  eventId?: string;
  ruleId?: string;
  status?: AutomationExecutionStatus;
}
export interface AutomationExecutionReader {
  findById(companyId: string, executionId: string): Promise<AutomationExecutionDto | null>;
  list(criteria: AutomationExecutionListCriteria): Promise<readonly AutomationExecutionDto[]>;
}
