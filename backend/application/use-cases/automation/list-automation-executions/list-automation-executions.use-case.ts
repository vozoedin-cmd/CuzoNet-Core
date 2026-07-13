import type { AutomationExecutionDto } from '../../../dto/automation/automation-execution.dto.js';
import type {
  AutomationExecutionListCriteria,
  AutomationExecutionReader,
} from '../../../ports/automation/automation-execution-reader.port.js';
import type { CompanyContext } from '../../../ports/company-context.port.js';
export class ListAutomationExecutions {
  public constructor(
    private readonly reader: AutomationExecutionReader,
    private readonly companyContext: CompanyContext,
  ) {}
  public execute(
    criteria: Omit<AutomationExecutionListCriteria, 'companyId'>,
  ): Promise<readonly AutomationExecutionDto[]> {
    return this.reader.list({ ...criteria, companyId: this.companyContext.getCompanyId() });
  }
}
