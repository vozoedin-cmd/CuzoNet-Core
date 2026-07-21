import type { ProvisioningActionAdapter } from '../../../ports/provisioning/provisioning-action-adapter.port.js';
import type { ProvisioningAttemptRepository } from '../../../ports/provisioning/provisioning-attempt-repository.port.js';
import type { ProvisioningRequestRepository } from '../../../ports/provisioning/provisioning-request-repository.port.js';
import { ProvisioningAttempt } from '../../../../domain/provisioning/provisioning-attempt.js';
import type { ProvisioningRequest } from '../../../../domain/provisioning/provisioning-request.js';
import type { ProvisioningRetryPolicy } from '../../../../domain/provisioning/services/provisioning-retry-policy.js';
import type { IdGenerator } from '../../../ports/id-generator.port.js';
import type { Clock } from '../../../ports/clock.port.js';

export interface DispatchProvisioningRequestInput {
  requestId: string;
  workerId: string;
}

export class DispatchProvisioningRequest {
  public constructor(
    private readonly requestRepository: ProvisioningRequestRepository,
    private readonly attemptRepository: ProvisioningAttemptRepository,
    private readonly adapters: ReadonlyMap<string, ProvisioningActionAdapter>,
    private readonly idGenerator: IdGenerator,
    private readonly clock: Clock,
    private readonly retryPolicy: ProvisioningRetryPolicy,
  ) {}

  public async execute(input: DispatchProvisioningRequestInput): Promise<void> {
    const request = await this.requestRepository.findById(input.requestId);
    if (!request) {
      return;
    }

    if (request.status !== 'processing' || request.processingWorkerId !== input.workerId) {
      // No poseemos el lease o no está en procesamiento
      return;
    }

    const adapter = this.adapters.get(request.actionType);
    const at = this.clock.now();

    const attempt = ProvisioningAttempt.create({
      attemptNumber: request.attemptCount + 1,
      id: this.idGenerator.generate(),
      requestId: request.id,
      startedAt: at,
      workerId: input.workerId,
    });

    await this.attemptRepository.save(attempt);

    if (!adapter) {
      attempt.completePermanentFailure('PROVISIONING_ADAPTER_NOT_FOUND', `Adaptador no encontrado para: ${request.actionType}`, this.clock.now());
      request.failPermanently('PROVISIONING_ADAPTER_NOT_FOUND', `Adaptador no encontrado para: ${request.actionType}`, this.clock.now());
      await this.saveTransactionally(request, attempt);
      return;
    }

    try {
      const result = await adapter.execute({
        actionType: request.actionType,
        attemptNumber: attempt.attemptNumber,
        companyId: request.companyId,
        configurationReference: request.configurationReference,
        idempotencyKey: request.idempotencyKey,
        inputSnapshotJson: request.inputSnapshotJson,
        requestId: request.id,
        target: { id: request.targetId, type: request.targetType },
      });

      const finishedAt = this.clock.now();
      const policyResult = this.retryPolicy.calculateNextAttempt(
        request.attemptCount + 1,
        result.outcome,
        'errorCode' in result ? result.errorCode : undefined,
        'retryAfterMs' in result ? result.retryAfterMs : undefined,
        finishedAt,
      );

      if (result.outcome === 'success') {
        attempt.completeSuccess(finishedAt, result.metadata);
        request.complete(finishedAt);
      } else if (result.outcome === 'permanentFailure' || policyResult.terminal) {
        attempt.completePermanentFailure(result.errorCode, result.errorMessage, finishedAt);
        request.failPermanently(result.errorCode, result.errorMessage, finishedAt);
      } else {
        attempt.completeTemporaryFailure(result.errorCode, result.errorMessage, finishedAt);
        request.failTemporarily(result.errorCode, result.errorMessage, policyResult.nextAttemptAt!, finishedAt);
      }

      await this.saveTransactionally(request, attempt);
    } catch (error: unknown) {
      const metadata: Record<string, unknown> = { error: (error as Error).message };
      if (error instanceof Error && error.stack) {
        metadata.stack = error.stack;
      }
      const finishedAt = this.clock.now();
      const errorMessage = (error as Error).message ?? 'Error inesperado.';
      const errorCode = 'UNEXPECTED_PROVISIONING_ERROR';
      
      const policyResult = this.retryPolicy.calculateNextAttempt(
        request.attemptCount + 1,
        'temporaryFailure',
        errorCode,
        undefined,
        finishedAt,
      );

      if (policyResult.terminal) {
        attempt.completePermanentFailure(errorCode, errorMessage, finishedAt);
        request.failPermanently(errorCode, errorMessage, finishedAt);
      } else {
        attempt.completeTemporaryFailure(errorCode, errorMessage, finishedAt);
        request.failTemporarily(errorCode, errorMessage, policyResult.nextAttemptAt!, finishedAt);
      }

      await this.saveTransactionally(request, attempt);
    }
  }

  private async saveTransactionally(request: ProvisioningRequest, attempt: ProvisioningAttempt): Promise<void> {
    // Si tuviéramos un UnitOfWork inyectado lo usaríamos aquí.
    // Por ahora, como es SQL o InMemory, guardar en orden es el estándar en estos adaptadores sin UoW.
    await this.requestRepository.save(request);
    await this.attemptRepository.save(attempt);
  }
}
