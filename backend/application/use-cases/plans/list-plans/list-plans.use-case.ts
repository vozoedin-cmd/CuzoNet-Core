import type { PlanDto } from '../../../dto/plans/plan.dto.js';
import type { CompanyContext } from '../../../ports/company-context.port.js';
import type { PlanReader } from '../../../ports/plans/plan-reader.port.js';

export class ListPlans {
  public constructor(
    private readonly reader: PlanReader,
    private readonly companyContext: CompanyContext,
  ) {}

  public execute(): Promise<readonly PlanDto[]> {
    return this.reader.listActive(this.companyContext.getCompanyId());
  }
}
