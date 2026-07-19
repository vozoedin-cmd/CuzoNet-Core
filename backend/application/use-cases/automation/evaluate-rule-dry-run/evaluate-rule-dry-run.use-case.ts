import type { AutomationRuleReader } from '../../../ports/automation/automation-rule-reader.port.js';
import type { CompanyContext } from '../../../ports/company-context.port.js';
import { AutomationRuleNotFoundError } from '../../../../domain/automation/errors/automation-rule-not-found.error.js';
import { RuleEvaluator } from '../../../../domain/automation/services/rule-evaluator.js';
import { EvaluationContext } from '../../../../domain/automation/value-objects/evaluation-context.js';
export interface EvaluateRuleDryRunResult {
    actions: readonly {
    actionType: string;
    actionVersion: number;
    reasonCode: string | undefined;
    targetServiceId: string | null;
  }[];
  matched: boolean;
  ruleId: string;
  ruleVersion: number;
}
export class EvaluateRuleDryRun {
  private readonly evaluator = new RuleEvaluator();
  public constructor(
    private readonly reader: AutomationRuleReader,
    private readonly companyContext: CompanyContext,
  ) {}
  public async execute(input: {
    contextId: string;
    facts: Readonly<Record<string, unknown>>;
    ruleId: string;
  }): Promise<EvaluateRuleDryRunResult> {
    const rule = await this.reader.findById(this.companyContext.getCompanyId(), input.ruleId);
    if (rule === null) throw new AutomationRuleNotFoundError();
    const context = EvaluationContext.create(input.contextId, input.facts);
    const result = this.evaluator.evaluate(rule.condition, context);
    return {
      actions: result.matched
        ? rule.actions.map((action) => ({
            actionType: action.actionType,
            actionVersion: action.actionVersion,
            reasonCode: action.reasonCode,
            targetServiceId:
              action.targetFactPath && typeof context.get(action.targetFactPath) === 'string'
                ? (context.get(action.targetFactPath) as string)
                : null,
          }))
        : [],
      matched: result.matched,
      ruleId: rule.id.value,
      ruleVersion: rule.version.value,
    };
  }
}
