import type { ReconciliationStatus } from './reconciliation-status.js';
import type { SyncResourceType } from './sync-resource-type.js';

export interface ReconciliationItem {
  readonly actualFields: Readonly<Record<string, string>> | undefined;
  readonly desiredFields: Readonly<Record<string, string>> | undefined;
  /** Field names (including the synthetic "disabled") that differ between desired and actual. Only set for "drifted". */
  readonly differingFields: readonly string[] | undefined;
  readonly reference: string;
  readonly resourceType: SyncResourceType;
  readonly status: ReconciliationStatus;
}
