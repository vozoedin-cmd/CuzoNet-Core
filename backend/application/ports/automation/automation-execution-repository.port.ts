import type { AutomationExecutionDto } from '../../dto/automation/automation-execution.dto.js';
export interface AutomationExecutionRepository {
  findUnique(
    companyId: string,
    ruleId: string,
    ruleVersion: number,
    eventId: string,
    contextId: string,
  ): Promise<AutomationExecutionDto | null>;
  save(companyId: string, execution: AutomationExecutionDto): Promise<void>;
}
