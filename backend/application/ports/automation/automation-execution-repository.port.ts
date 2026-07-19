import type { AutomationExecutionDto } from '../../dto/automation/automation-execution.dto.js';
export interface AutomationExecutionRepository {
  findById(companyId: string, executionId: string): Promise<AutomationExecutionDto | null>;
  findUnique(
    companyId: string,
    eventId: string,
    ruleId: string,
  ): Promise<AutomationExecutionDto | null>;
  save(companyId: string, execution: AutomationExecutionDto): Promise<void>;
  claimDue(
    workerId: string,
    now: Date,
    leaseUntil: Date,
    limit: number,
  ): Promise<readonly AutomationExecutionDto[]>;
}
