import type { DesiredStateRepository } from '../../application/ports/synchronization/desired-state-repository.port.js';
import type { DesiredResourceStateRepository } from '../../application/ports/synchronization/desired-resource-state-repository.port.js';
import type { NormalizedResourceRecord } from '../../domain/synchronization/normalized-resource-record.js';
import type { SyncResourceType } from '../../domain/synchronization/sync-resource-type.js';

/**
 * The definitive DesiredStateRepository implementation (Hito 21.5): reads
 * from the declarative desired-state store instead of reconstructing state
 * from Provisioning Engine history (see ProvisioningHistoryDesiredStateRepository,
 * kept as the temporary alternative). Composes the same
 * DesiredResourceStateRepository the write-side use-cases use, so both
 * sides of the store stay perfectly consistent by construction.
 */
export class SqliteDesiredStateRepository implements DesiredStateRepository {
  public constructor(private readonly repository: DesiredResourceStateRepository) {}

  public async getDesiredState(
    companyId: string,
    routerId: string,
    resourceType: SyncResourceType,
  ): Promise<readonly NormalizedResourceRecord[]> {
    const states = await this.repository.listByRouter(companyId, routerId, resourceType);
    return states.map((state) => ({
      disabled: state.disabled,
      fields: state.desiredFields,
      reference: state.reference,
    }));
  }
}
