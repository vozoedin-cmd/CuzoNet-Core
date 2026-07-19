import type { AutomationAttemptDto } from '../../dto/automation/automation-attempt.dto.js';

export interface AutomationAttemptRepository {
  save(attempt: AutomationAttemptDto): Promise<void>;
  listByExecution(executionId: string): Promise<readonly AutomationAttemptDto[]>;
}
