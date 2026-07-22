import type { DesiredResourceState } from '../../../domain/synchronization/desired-resource-state.js';
import type { SyncResourceType } from '../../../domain/synchronization/sync-resource-type.js';

/**
 * The declarative desired-state store's CRUD port, used by the
 * create/update/delete/read use-cases behind the API. This is distinct
 * from (but backs) the read-only `DesiredStateRepository` the
 * Synchronization Engine consumes — see SqliteDesiredStateRepository,
 * which composes this port to satisfy that one.
 */
export interface DesiredResourceStateRepository {
  findByReference(
    companyId: string,
    routerId: string,
    resourceType: SyncResourceType,
    reference: string,
  ): Promise<DesiredResourceState | undefined>;
  listByRouter(
    companyId: string,
    routerId: string,
    resourceType: SyncResourceType,
  ): Promise<readonly DesiredResourceState[]>;
  save(state: DesiredResourceState): Promise<void>;
}
