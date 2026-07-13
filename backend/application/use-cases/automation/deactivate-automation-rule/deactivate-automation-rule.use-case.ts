import type { AutomationRuleReader } from '../../../ports/automation/automation-rule-reader.port.js';
import type { AutomationRuleRepository } from '../../../ports/automation/automation-rule-repository.port.js';
import type { CompanyContext } from '../../../ports/company-context.port.js';
import { AutomationRuleNotFoundError } from '../../../../domain/automation/errors/automation-rule-not-found.error.js';
export class DeactivateAutomationRule {
  public constructor(
    private readonly repository: AutomationRuleRepository,
    private readonly reader: AutomationRuleReader,
    private readonly companyContext: CompanyContext,
  ) {}
  public async execute(ruleId: string): Promise<void> {
    const rule = await this.reader.findById(this.companyContext.getCompanyId(), ruleId);
    if (rule === null) throw new AutomationRuleNotFoundError();
    rule.deactivate();
    await this.repository.save(rule);
  }
}
