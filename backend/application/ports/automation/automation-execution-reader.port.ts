import type {
  AutomationExecutionDto,
  AutomationExecutionStatus,
} from '../../dto/automation/automation-execution.dto.js';
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
