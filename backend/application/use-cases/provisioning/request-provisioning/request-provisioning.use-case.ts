import type { ProvisioningRequestDto, RequestProvisioningInput } from '../../../dto/provisioning/provisioning-request.dto.js';
import type { CompanyContext } from '../../../ports/company-context.port.js';
import type { IdGenerator } from '../../../ports/id-generator.port.js';
import type { ProvisioningRequestRepository } from '../../../ports/provisioning/provisioning-request-repository.port.js';
import { ProvisioningRequest } from '../../../../domain/provisioning/provisioning-request.js';
import { ProvisioningIdempotencyConflictError } from '../../../../domain/provisioning/errors/provisioning-engine.error.js';
import { ProvisioningRequestMapper } from '../../../mappers/provisioning/provisioning-request.mapper.js';

export class RequestProvisioning {
  public constructor(
    private readonly repository: ProvisioningRequestRepository,
    private readonly companyContext: CompanyContext,
    private readonly idGenerator: IdGenerator,
    private readonly maxAttempts: number = 5,
  ) {}

  public async execute(input: RequestProvisioningInput): Promise<ProvisioningRequestDto> {
    const companyId = this.companyContext.getCompanyId();
    const inputHash = ProvisioningRequest.generateInputHash(
      input.actionType,
      input.targetType,
      input.targetId,
      input.configurationReference,
      input.inputSnapshotJson
    );

    const request = ProvisioningRequest.create({
      actionType: input.actionType,
      companyId,
      configurationReference: input.configurationReference,
      id: this.idGenerator.generate(),
      idempotencyKey: input.idempotencyKey,
      inputHash,
      inputSnapshotJson: input.inputSnapshotJson,
      maxAttempts: this.maxAttempts,
      sourceExecutionId: input.sourceExecutionId,
      targetId: input.targetId,
      targetType: input.targetType,
    });

    const result = await this.repository.insertNew(request);
    
    if (result === 'conflict') {
      const existing = await this.repository.findByIdempotencyKey(companyId, input.idempotencyKey);
      if (!existing) {
        throw new Error('Idempotency key conflict but row not found');
      }
      
      if (existing.inputHash !== inputHash || existing.sourceExecutionId !== input.sourceExecutionId) {
        throw new ProvisioningIdempotencyConflictError(input.idempotencyKey);
      }
      return ProvisioningRequestMapper.toDto(existing);
    }

    return ProvisioningRequestMapper.toDto(request);
  }
}
