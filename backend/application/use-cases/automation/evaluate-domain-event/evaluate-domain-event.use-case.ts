import { parseConsumedDomainEvent } from '../../../contracts/automation/consumed-event-parser.js';
import type {
  AutomationActionResultDto,
  AutomationExecutionDto,
} from '../../../dto/automation/automation-execution.dto.js';
import type { EventEvaluationSummaryDto } from '../../../dto/automation/event-evaluation-summary.dto.js';
import type { AutomationEventReceiptPort } from '../../../ports/automation/automation-event-receipt.port.js';
import type { AutomationExecutionRepository } from '../../../ports/automation/automation-execution-repository.port.js';
import type { AutomationFactsPort } from '../../../ports/automation/automation-facts.port.js';
import type { AutomationRuleReader } from '../../../ports/automation/automation-rule-reader.port.js';
import type { AutomationUnitOfWork } from '../../../ports/automation/automation-unit-of-work.port.js';
import type { ServiceReactivationRequestPort } from '../../../ports/automation/service-reactivation-request.port.js';
import type { Clock } from '../../../ports/clock.port.js';
import type { CompanyContext } from '../../../ports/company-context.port.js';
import type { IdGenerator } from '../../../ports/id-generator.port.js';
import { AutomationRuleConflictError } from '../../../../domain/automation/errors/automation-rule-conflict.error.js';
import { RuleEvaluator } from '../../../../domain/automation/services/rule-evaluator.js';
import { ActionRequestKey } from '../../../../domain/automation/value-objects/action-request-key.js';
export class EvaluateDomainEvent {
  private readonly evaluator = new RuleEvaluator();
  public constructor(
    private readonly rules: AutomationRuleReader,
    private readonly executions: AutomationExecutionRepository,
    private readonly receipts: AutomationEventReceiptPort,
    private readonly facts: AutomationFactsPort,
    private readonly reactivationRequests: ServiceReactivationRequestPort,
    private readonly unitOfWork: AutomationUnitOfWork,
    private readonly companyContext: CompanyContext,
    private readonly idGenerator: IdGenerator,
    private readonly clock: Clock,
  ) {}
  public async execute(input: unknown): Promise<EventEvaluationSummaryDto> {
    const event = parseConsumedDomainEvent(input);
    const companyId = this.companyContext.getCompanyId();
    if (event.companyId !== companyId)
      throw new AutomationRuleConflictError('El evento no pertenece a la empresa activa.');
    if ((await this.receipts.getStatus(companyId, event.eventId)) === 'processed')
      return {
        actionsRejected: 0,
        actionsRequested: 0,
        alreadyProcessed: true,
        eventId: event.eventId,
        rulesEvaluated: 0,
        rulesMatched: 0,
      };
    await this.receipts.mark(companyId, event.eventId, 'processing');
    let rulesEvaluated = 0;
    let rulesMatched = 0;
    let actionsRequested = 0;
    let actionsRejected = 0;
    try {
      const rules = await this.rules.listActiveByTrigger(
        companyId,
        event.eventType,
        event.schemaVersion,
      );
      const contexts = await this.facts.buildContexts(event);
      for (const rule of rules)
        for (const context of contexts) {
          const existing = await this.executions.findUnique(
            companyId,
            rule.id.value,
            rule.version.value,
            event.eventId,
            context.id,
          );
          if (existing !== null && existing.status !== 'failed') continue;
          rulesEvaluated += 1;
          const evaluation = this.evaluator.evaluate(rule.condition, context);
          if (!evaluation.matched) {
            const execution: AutomationExecutionDto = {
              actionResults: [],
              completedAt: this.clock.now().toISOString(),
              contextId: context.id,
              eventId: event.eventId,
              id: existing?.id ?? this.idGenerator.generate(),
              matched: false,
              ruleId: rule.id.value,
              ruleVersion: rule.version.value,
              startedAt: existing?.startedAt ?? this.clock.now().toISOString(),
              status: 'evaluated_no_match',
            };
            await this.executions.save(companyId, execution);
            continue;
          }
          rulesMatched += 1;
          const startedAt = existing?.startedAt ?? this.clock.now().toISOString();
          const executionId = existing?.id ?? this.idGenerator.generate();
          const pendingResults: AutomationActionResultDto[] = rule.actions.map((action, index) => ({
            actionRequestKey: ActionRequestKey.create(
              rule.id.value,
              rule.version.value,
              event.eventId,
              context.id,
              index,
            ).value,
            actionType: action.actionType,
            actionVersion: action.actionVersion,
            status: 'pending',
          }));
          await this.unitOfWork.execute(() =>
            this.executions.save(companyId, {
              actionResults: pendingResults,
              contextId: context.id,
              eventId: event.eventId,
              id: executionId,
              matched: true,
              ruleId: rule.id.value,
              ruleVersion: rule.version.value,
              startedAt,
              status: 'action_pending',
            }),
          );
          const actionResults: AutomationActionResultDto[] = [];
          for (const [index, action] of rule.actions.entries()) {
            const actionRequestKey = ActionRequestKey.create(
              rule.id.value,
              rule.version.value,
              event.eventId,
              context.id,
              index,
            ).value;
            const target = context.get(action.targetFactPath);
            if (typeof target !== 'string') {
              actionResults.push({
                actionRequestKey,
                actionType: action.actionType,
                actionVersion: action.actionVersion,
                status: 'rejected',
              });
              actionsRejected += 1;
              continue;
            }
            const requestResult = await this.reactivationRequests.requestReactivation({
              actionRequestKey,
              causationId: event.eventId,
              companyId,
              correlationId: event.correlationId,
              reasonCode: action.reasonCode,
              serviceId: target,
            });
            actionResults.push({
              actionRequestKey,
              actionType: action.actionType,
              actionVersion: action.actionVersion,
              ...(requestResult.requestId === undefined
                ? {}
                : { requestId: requestResult.requestId }),
              status: requestResult.status,
            });
            if (requestResult.status === 'accepted') actionsRequested += 1;
            else actionsRejected += 1;
          }
          await this.executions.save(companyId, {
            actionResults,
            completedAt: this.clock.now().toISOString(),
            contextId: context.id,
            eventId: event.eventId,
            id: executionId,
            matched: true,
            ruleId: rule.id.value,
            ruleVersion: rule.version.value,
            startedAt,
            status: actionResults.every((result) => result.status === 'accepted')
              ? 'action_requested'
              : 'action_rejected',
          });
        }
      await this.receipts.mark(companyId, event.eventId, 'processed');
      return {
        actionsRejected,
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
