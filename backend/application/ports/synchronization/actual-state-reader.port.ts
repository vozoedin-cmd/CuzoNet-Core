import type { NormalizedResourceRecord } from '../../../domain/synchronization/normalized-resource-record.js';
import type { SyncResourceType } from '../../../domain/synchronization/sync-resource-type.js';

/** Reads and normalizes a router's real, current state for one resource type. */
export interface ActualStateReader {
  readActualState(
    companyId: string,
    routerId: string,
    resourceType: SyncResourceType,
  ): Promise<readonly NormalizedResourceRecord[]>;
}
