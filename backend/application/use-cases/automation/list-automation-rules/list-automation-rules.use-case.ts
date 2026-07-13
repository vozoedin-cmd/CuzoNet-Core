import {
  toAutomationRuleDto,
  type AutomationRuleDto,
} from '../../../dto/automation/automation-rule.dto.js';
import type {
  AutomationRuleListCriteria,
  AutomationRuleReader,
} from '../../../ports/automation/automation-rule-reader.port.js';
import type { CompanyContext } from '../../../ports/company-context.port.js';
export class ListAutomationRules {
  public constructor(
    private readonly reader: AutomationRuleReader,
    private readonly companyContext: CompanyContext,
  ) {}
  public async execute(
    criteria: Omit<AutomationRuleListCriteria, 'companyId'>,
  ): Promise<readonly AutomationRuleDto[]> {
    return (
      await this.reader.list({ ...criteria, companyId: this.companyContext.getCompanyId() })
    ).map(toAutomationRuleDto);
  }
}
