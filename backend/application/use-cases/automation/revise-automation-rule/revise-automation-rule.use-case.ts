import {
  toAutomationRuleDto,
  type AutomationRuleDto,
  type ReviseAutomationRuleInput,
} from '../../../dto/automation/automation-rule.dto.js';
import type { AutomationActorContext } from '../../../ports/automation/automation-actor-context.port.js';
import type { AutomationRuleReader } from '../../../ports/automation/automation-rule-reader.port.js';
import type { AutomationRuleRepository } from '../../../ports/automation/automation-rule-repository.port.js';
import type { Clock } from '../../../ports/clock.port.js';
import type { CompanyContext } from '../../../ports/company-context.port.js';
import { AutomationRuleNotFoundError } from '../../../../domain/automation/errors/automation-rule-not-found.error.js';
import { ActionDefinition } from '../../../../domain/automation/value-objects/action-definition.js';
import { AutomationRuleName } from '../../../../domain/automation/value-objects/automation-rule-name.js';
import { RuleCondition } from '../../../../domain/automation/value-objects/rule-condition.js';
export class ReviseAutomationRule {
  public constructor(
    private readonly repository: AutomationRuleRepository,
    private readonly reader: AutomationRuleReader,
    private readonly companyContext: CompanyContext,
    private readonly actorContext: AutomationActorContext,
    private readonly clock: Clock,
  ) {}
  public async execute(input: ReviseAutomationRuleInput): Promise<AutomationRuleDto> {
    const rule = await this.reader.findById(this.companyContext.getCompanyId(), input.ruleId);
    if (rule === null) throw new AutomationRuleNotFoundError();
    rule.revise({
      actions: input.actions.map(ActionDefinition.create),
      condition: RuleCondition.create(input.condition),
      expectedVersion: input.expectedVersion,
      name: AutomationRuleName.create(input.name),
      priority: input.priority,
      updatedAt: this.clock.now(),
      updatedBy: this.actorContext.getActorId(),
    });
    await this.repository.save(rule);
    return toAutomationRuleDto(rule);
  }
}
