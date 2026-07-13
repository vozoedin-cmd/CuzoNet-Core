import type { AutomationExecutionDto } from '../../../dto/automation/automation-execution.dto.js';
import type { AutomationExecutionReader } from '../../../ports/automation/automation-execution-reader.port.js';
import type { CompanyContext } from '../../../ports/company-context.port.js';
import { ApplicationError } from '../../../../shared/errors/application-error.js';
export class GetAutomationExecution {
  public constructor(
    private readonly reader: AutomationExecutionReader,
    private readonly companyContext: CompanyContext,
  ) {}
  public async execute(executionId: string): Promise<AutomationExecutionDto> {
    const execution = await this.reader.findById(this.companyContext.getCompanyId(), executionId);
    if (execution === null)
      throw new ApplicationError({
        code: 'RESOURCE_NOT_FOUND',
        message: 'Ejecución de Automation no encontrada.',
      });
    return execution;
  }
}
