import {
  toAutomationRuleDto,
  type AutomationRuleDto,
} from '../../../dto/automation/automation-rule.dto.js';
import type { AutomationRuleReader } from '../../../ports/automation/automation-rule-reader.port.js';
import type { CompanyContext } from '../../../ports/company-context.port.js';
import { AutomationRuleNotFoundError } from '../../../../domain/automation/errors/automation-rule-not-found.error.js';
export class GetAutomationRule {
  public constructor(
    private readonly reader: AutomationRuleReader,
    private readonly companyContext: CompanyContext,
  ) {}
  public async execute(ruleId: string): Promise<AutomationRuleDto> {
    const rule = await this.reader.findById(this.companyContext.getCompanyId(), ruleId);
    if (rule === null) throw new AutomationRuleNotFoundError();
    return toAutomationRuleDto(rule);
  }
}
