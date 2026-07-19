import type { AutomationActionAdapter } from '../../../ports/automation/automation-action-adapter.port.js';
import type { AutomationAttemptRepository } from '../../../ports/automation/automation-attempt-repository.port.js';
import type { AutomationExecutionRepository } from '../../../ports/automation/automation-execution-repository.port.js';
import type { Clock } from '../../../ports/clock.port.js';
import type { IdGenerator } from '../../../ports/id-generator.port.js';
import { AutomationAttempt } from '../../../../domain/automation/automation-attempt.js';
import { AutomationExecution } from '../../../../domain/automation/automation-execution.js';
import { AutomationRetryPolicy } from '../../../../domain/automation/services/automation-retry-policy.js';

export class DispatchAutomationExecutionUseCase {
  private readonly retryPolicy: AutomationRetryPolicy;

  public constructor(
    private readonly executions: AutomationExecutionRepository,
    private readonly attempts: AutomationAttemptRepository,
    private readonly adapters: readonly AutomationActionAdapter[],
    private readonly idGenerator: IdGenerator,
    private readonly clock: Clock,
    options: { maxAttempts?: number } = {},
  ) {
    this.retryPolicy = new AutomationRetryPolicy(options.maxAttempts);
  }

  public async execute(
    companyId: string,
    executionId: string,
    workerId: string,
    leaseUntil: Date,
  ): Promise<void> {
    const dto = await this.executions.findById(companyId, executionId);
    if (!dto) return;

    const execution = AutomationExecution.fromDto(dto);
    const now = this.clock.now();

    try {
      execution.claim(workerId, now, leaseUntil);
    } catch {
      // Could not claim execution (probably locked by another worker)
      return;
    }
    
    await this.executions.save(companyId, execution.toDto());

    const attempt = AutomationAttempt.create(
      execution.id,
      execution.attemptCount + 1, // Next attempt
      now,
      this.idGenerator.generate(),
    );
    await this.attempts.save(attempt.toDto());

    let snapshot: Record<string, unknown>;
    try {
      snapshot = JSON.parse(execution.actionSnapshotJson) as Record<string, unknown>;
    } catch {
      // Invalid snapshot
      execution.fail('INVALID_SNAPSHOT', 'Action snapshot is not valid JSON', now);
      await this.executions.save(companyId, execution.toDto());
      return;
    }

    const adapter = this.adapters.find((a) => a.type === execution.actionType);
    if (!adapter) {
      attempt.fail(undefined, 'ADAPTER_NOT_FOUND', `No adapter found for type ${execution.actionType}`, now);
      execution.fail('ADAPTER_NOT_FOUND', `No adapter found for type ${execution.actionType}`, now);
      await this.attempts.save(attempt.toDto());
      await this.executions.save(companyId, execution.toDto());
      return;
    }

    try {
      const result = await adapter.execute(snapshot['configurationReference'] as string, {
        companyId,
        contextId: '', // Context is no longer supported at this level since contexts were evaluated to true
        equipmentId: snapshot['equipmentId'] as string,
        eventId: execution.eventId,
        executionId: execution.id,
        operationType: snapshot['operationType'] as string,
        parameters: snapshot['parameters'] as Record<string, unknown>,
        payloadTemplate: snapshot['payloadTemplate'] as Record<string, unknown>,
        ruleId: execution.ruleId,
        ruleVersion: snapshot['actionVersion'] as number,
        workflowKey: snapshot['workflowKey'] as string,
      });

      if (result.outcome === 'success') {
        attempt.succeed(result.responseCode, result.providerExecutionId, JSON.stringify(result.metadata ?? {}), now);
        execution.succeed(result.providerExecutionId, now);
      } else if (result.outcome === 'permanent_failure') {
        attempt.fail(result.responseCode, result.errorCode, result.safeMessage, now);
        execution.fail(result.errorCode, result.safeMessage, now);
      } else if (result.outcome === 'retryable_failure') {
        attempt.fail(result.responseCode, result.errorCode, result.safeMessage, now);
        
        // Calculate retry
        const nextAttemptAt = this.retryPolicy.calculateNextAttemptAt(execution.attemptCount + 1, now);
        if (nextAttemptAt) {
          execution.retry(result.errorCode, result.safeMessage, nextAttemptAt, now);
        } else {
          execution.fail(result.errorCode, result.safeMessage, now);
        }
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error during execution';
      attempt.fail(undefined, 'EXECUTION_ERROR', message, now);
      
      const nextAttemptAt = this.retryPolicy.calculateNextAttemptAt(execution.attemptCount + 1, now);
      if (nextAttemptAt) {
        execution.retry('EXECUTION_ERROR', message, nextAttemptAt, now);
      } else {
        execution.fail('EXECUTION_ERROR', message, now);
      }
    }

    await this.attempts.save(attempt.toDto());
    await this.executions.save(companyId, execution.toDto());
  }
}
