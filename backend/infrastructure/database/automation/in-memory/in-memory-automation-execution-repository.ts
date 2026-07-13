import type { AutomationExecutionDto } from '../../../../application/dto/automation/automation-execution.dto.js';
import type {
  AutomationExecutionListCriteria,
  AutomationExecutionReader,
} from '../../../../application/ports/automation/automation-execution-reader.port.js';
import type { AutomationExecutionRepository } from '../../../../application/ports/automation/automation-execution-repository.port.js';
export class InMemoryAutomationExecutionRepository
  implements AutomationExecutionRepository, AutomationExecutionReader
{
  private readonly records = new Map<
    string,
    { companyId: string; execution: AutomationExecutionDto }
  >();
  public save(companyId: string, execution: AutomationExecutionDto): Promise<void> {
    this.records.set(`${companyId}:${execution.id}`, {
      companyId,
      execution: structuredClone(execution),
    });
    return Promise.resolve();
  }
  public findUnique(
    companyId: string,
    ruleId: string,
    ruleVersion: number,
    eventId: string,
    contextId: string,
  ): Promise<AutomationExecutionDto | null> {
    const record = [...this.records.values()].find(
      (candidate) =>
        candidate.companyId === companyId &&
        candidate.execution.ruleId === ruleId &&
        candidate.execution.ruleVersion === ruleVersion &&
        candidate.execution.eventId === eventId &&
        candidate.execution.contextId === contextId,
    );
    return Promise.resolve(record === undefined ? null : structuredClone(record.execution));
  }
  public findById(companyId: string, executionId: string): Promise<AutomationExecutionDto | null> {
    const record = this.records.get(`${companyId}:${executionId}`);
    return Promise.resolve(record === undefined ? null : structuredClone(record.execution));
  }
  public list(
    criteria: AutomationExecutionListCriteria,
  ): Promise<readonly AutomationExecutionDto[]> {
    return Promise.resolve(
      [...this.records.values()]
        .filter(
          (record) =>
            record.companyId === criteria.companyId &&
            (criteria.ruleId === undefined || record.execution.ruleId === criteria.ruleId) &&
            (criteria.eventId === undefined || record.execution.eventId === criteria.eventId) &&
            (criteria.status === undefined || record.execution.status === criteria.status),
        )
        .map((record) => structuredClone(record.execution)),
    );
  }
}
