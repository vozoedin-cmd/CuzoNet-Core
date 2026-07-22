import type { DesiredResourceStateIdentity } from '../../dto/synchronization/desired-resource-state.dto.js';
import type { Clock } from '../../ports/clock.port.js';
import type { CompanyContext } from '../../ports/company-context.port.js';
import type { DesiredResourceStateRepository } from '../../ports/synchronization/desired-resource-state-repository.port.js';

/** Soft-deletes a declared desired resource: idempotent if it never existed or was already removed. */
export class RemoveDesiredResourceState {
  public constructor(
    private readonly repository: DesiredResourceStateRepository,
    private readonly companyContext: CompanyContext,
    private readonly clock: Clock,
  ) {}

  public async execute(input: DesiredResourceStateIdentity): Promise<void> {
    const companyId = this.companyContext.getCompanyId();
    const state = await this.repository.findByReference(companyId, input.routerId, input.resourceType, input.reference);
    if (state === undefined) return;

    const changed = state.markDeleted(this.clock.now());
    if (changed) await this.repository.save(state);
  }
}
