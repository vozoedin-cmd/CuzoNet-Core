import {
  toAutomationRuleDto,
  type AutomationRuleDto,
  type CreateAutomationRuleInput,
} from '../../../dto/automation/automation-rule.dto.js';
import type { AutomationActorContext } from '../../../ports/automation/automation-actor-context.port.js';
import type { AutomationRuleRepository } from '../../../ports/automation/automation-rule-repository.port.js';
import type { Clock } from '../../../ports/clock.port.js';
import type { CompanyContext } from '../../../ports/company-context.port.js';
import type { IdGenerator } from '../../../ports/id-generator.port.js';
import { AutomationRule } from '../../../../domain/automation/automation-rule.js';
import { ActionDefinition } from '../../../../domain/automation/value-objects/action-definition.js';
import { AutomationRuleId } from '../../../../domain/automation/value-objects/automation-rule-id.js';
import { AutomationRuleName } from '../../../../domain/automation/value-objects/automation-rule-name.js';
import { AutomationRuleStatus } from '../../../../domain/automation/value-objects/automation-rule-status.js';
import { AutomationRuleVersion } from '../../../../domain/automation/value-objects/automation-rule-version.js';
import { EventTrigger } from '../../../../domain/automation/value-objects/event-trigger.js';
import { RuleCondition } from '../../../../domain/automation/value-objects/rule-condition.js';
export class CreateAutomationRule {
  public constructor(
    private readonly repository: AutomationRuleRepository,
    private readonly companyContext: CompanyContext,
    private readonly actorContext: AutomationActorContext,
    private readonly idGenerator: IdGenerator,
    private readonly clock: Clock,
  ) {}
  public async execute(input: CreateAutomationRuleInput): Promise<AutomationRuleDto> {
    const rule = AutomationRule.create({
      actions: input.actions.map(ActionDefinition.create),
      companyId: this.companyContext.getCompanyId(),
      condition: RuleCondition.create(input.condition),
      createdAt: this.clock.now(),
      createdBy: this.actorContext.getActorId(),
      id: AutomationRuleId.create(this.idGenerator.generate()),
      name: AutomationRuleName.create(input.name),
      priority: input.priority,
      status: input.active ? AutomationRuleStatus.active() : AutomationRuleStatus.inactive(),
      trigger: EventTrigger.create(input.trigger.eventType, input.trigger.schemaVersion),
      version: AutomationRuleVersion.create(1),
    });
    await this.repository.save(rule);
    return toAutomationRuleDto(rule);
  }
}
