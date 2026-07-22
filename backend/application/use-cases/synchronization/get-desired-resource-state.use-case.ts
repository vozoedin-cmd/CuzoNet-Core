import type { DesiredResourceStateDto, DesiredResourceStateIdentity } from '../../dto/synchronization/desired-resource-state.dto.js';
import { DesiredResourceStateMapper } from '../../mappers/synchronization/desired-resource-state.mapper.js';
import type { CompanyContext } from '../../ports/company-context.port.js';
import type { DesiredResourceStateRepository } from '../../ports/synchronization/desired-resource-state-repository.port.js';

export class GetDesiredResourceState {
  public constructor(
    private readonly repository: DesiredResourceStateRepository,
    private readonly companyContext: CompanyContext,
  ) {}

  public async execute(input: DesiredResourceStateIdentity): Promise<DesiredResourceStateDto | undefined> {
    const companyId = this.companyContext.getCompanyId();
    const state = await this.repository.findByReference(companyId, input.routerId, input.resourceType, input.reference);
    if (state === undefined || state.isDeleted) return undefined;
    return DesiredResourceStateMapper.toDto(state);
  }
}
