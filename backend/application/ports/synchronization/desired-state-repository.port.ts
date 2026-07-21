import type { NormalizedResourceRecord } from '../../../domain/synchronization/normalized-resource-record.js';
import type { SyncResourceType } from '../../../domain/synchronization/sync-resource-type.js';

/**
 * Source of "desired state" for the Synchronization Engine. Phase 1's only
 * implementation reconstructs it from the Provisioning Engine's completed
 * request history (see ProvisioningHistoryDesiredStateRepository) — but the
 * engine itself depends only on this interface, so that history-derived
 * implementation can be swapped later for a genuine declarative
 * configuration store without touching the engine.
 */
export interface DesiredStateRepository {
  getDesiredState(
    companyId: string,
    routerId: string,
    resourceType: SyncResourceType,
  ): Promise<readonly NormalizedResourceRecord[]>;
}
