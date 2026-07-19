import { parseConsumedDomainEvent } from '../../../contracts/automation/consumed-event-parser.js';
import type { AutomationExecutionDto } from '../../../dto/automation/automation-execution.dto.js';
import type { EventEvaluationSummaryDto } from '../../../dto/automation/event-evaluation-summary.dto.js';
import type { AutomationEventReceiptPort } from '../../../ports/automation/automation-event-receipt.port.js';
import type { AutomationExecutionRepository } from '../../../ports/automation/automation-execution-repository.port.js';
import type { AutomationFactsPort } from '../../../ports/automation/automation-facts.port.js';
import type { AutomationRuleReader } from '../../../ports/automation/automation-rule-reader.port.js';
import type { Clock } from '../../../ports/clock.port.js';
import type { CompanyContext } from '../../../ports/company-context.port.js';
import type { IdGenerator } from '../../../ports/id-generator.port.js';
import { AutomationRuleConflictError } from '../../../../domain/automation/errors/automation-rule-conflict.error.js';
import { RuleEvaluator } from '../../../../domain/automation/services/rule-evaluator.js';

export class EvaluateDomainEvent {
  private readonly evaluator = new RuleEvaluator();

  public constructor(
    private readonly rules: AutomationRuleReader,
    private readonly executions: AutomationExecutionRepository,
    private readonly receipts: AutomationEventReceiptPort,
    private readonly facts: AutomationFactsPort,
    private readonly companyContext: CompanyContext,
    private readonly idGenerator: IdGenerator,
    private readonly clock: Clock,
    private readonly options: { maxAttempts?: number; maxCausalDepth?: number } = {},
  ) {}

  public async execute(input: unknown): Promise<EventEvaluationSummaryDto> {
    const event = parseConsumedDomainEvent(input);
    const companyId = this.companyContext.getCompanyId();

    if (event.companyId !== companyId)
      throw new AutomationRuleConflictError('El evento no pertenece a la empresa activa.');

    const causalDepth =
      typeof event.payload['causalDepth'] === 'number'
        ? (event.payload['causalDepth'] as number)
        : typeof event.payload['causal_depth'] === 'number'
        ? (event.payload['causal_depth'] as number)
        : 1;

    if (causalDepth > (this.options.maxCausalDepth ?? 5)) {
      return {
        actionsRejected: 0,
        actionsRequested: 0,
        alreadyProcessed: true, // We consider it processed to avoid infinite retries
        eventId: event.eventId,
        rulesEvaluated: 0,
        rulesMatched: 0,
      };
    }

    if ((await this.receipts.getStatus(companyId, event.eventId)) === 'processed')
      return {
        actionsRejected: 0,
        actionsRequested: 0, // Legacy counts left at 0 as we no longer synchronously request actions
        alreadyProcessed: true,
        eventId: event.eventId,
        rulesEvaluated: 0,
        rulesMatched: 0,
      };

    await this.receipts.mark(companyId, event.eventId, 'processing');

    let rulesEvaluated = 0;
    let rulesMatched = 0;
    let actionsRequested = 0;

    try {
      const rules = await this.rules.listActiveByTrigger(
        companyId,
        event.eventType,
        event.schemaVersion,
      );
      const contexts = await this.facts.buildContexts(event);

      for (const rule of rules) {
        for (const context of contexts) {
          const existing = await this.executions.findUnique(
            companyId,
            event.eventId,
            rule.id.value,
          );

          if (existing !== null) continue;

          rulesEvaluated += 1;
          const evaluation = this.evaluator.evaluate(rule.condition, context);

          if (!evaluation.matched) {
            continue; // We no longer save evaluated_no_match executions in the new engine
          }

          rulesMatched += 1;

          for (const action of rule.actions) {
            const executionId = this.idGenerator.generate();
            const now = this.clock.now().toISOString();

            // Prepare dynamic fields depending on action type
            const actionSnapshotJson = JSON.stringify({
              actionType: action.actionType,
              actionVersion: action.actionVersion,
              reasonCode: action.reasonCode,
              targetFactPath: action.targetFactPath?.value,
              configurationReference: action.configurationReference,
              payloadTemplate: action.payloadTemplate,
              workflowKey: action.workflowKey,
              operationType: action.operationType,
              equipmentId: action.equipmentId,
              parameters: action.parameters
            });

            const executionDto: AutomationExecutionDto = {
              actionSnapshotJson,
              actionType: action.actionType,
              attemptCount: 0,
              companyId,
              createdAt: now,
              eventId: event.eventId,
              eventSnapshotJson: JSON.stringify(event.payload),
              eventType: event.eventType,
              id: executionId,
              maxAttempts: this.options.maxAttempts ?? 5,
              ruleId: rule.id.value,
              status: 'pending',
              updatedAt: now,
            };

            await this.executions.save(companyId, executionDto);
            actionsRequested += 1;
          }
        }
      }

      await this.receipts.mark(companyId, event.eventId, 'processed');

      return {
        actionsRejected: 0,
        actionsRequested,
        alreadyProcessed: false,
        eventId: event.eventId,
        rulesEvaluated,
        rulesMatched,
      };
    } catch (error) {
      await this.receipts.mark(companyId, event.eventId, 'failed');
      throw error;
    }
  }
}
