import type { DesiredResourceStateDto } from '../../dto/synchronization/desired-resource-state.dto.js';
import { DesiredResourceStateMapper } from '../../mappers/synchronization/desired-resource-state.mapper.js';
import type { CompanyContext } from '../../ports/company-context.port.js';
import type { DesiredResourceStateRepository } from '../../ports/synchronization/desired-resource-state-repository.port.js';
import type { SyncResourceType } from '../../../domain/synchronization/sync-resource-type.js';

export class ListDesiredResourceStates {
  public constructor(
    private readonly repository: DesiredResourceStateRepository,
    private readonly companyContext: CompanyContext,
  ) {}

  public async execute(routerId: string, resourceType: SyncResourceType): Promise<DesiredResourceStateDto[]> {
    const companyId = this.companyContext.getCompanyId();
    const states = await this.repository.listByRouter(companyId, routerId, resourceType);
    return states.map(DesiredResourceStateMapper.toDto);
  }
}
