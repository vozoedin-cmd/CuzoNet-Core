import type { NormalizedFields } from './normalized-resource-record.js';
import type { ReconciliationStatus } from './reconciliation-status.js';
import type { SyncResourceType } from './sync-resource-type.js';

/**
 * Safe diagnostic projection of an actual record. It intentionally omits
 * RouterOS IDs and raw snapshots; `fields` is the normalized, resource-specific
 * allowlist already used by reconciliation.
 */
export interface ReconciliationActualCandidate {
  readonly disabled: boolean;
  readonly fields: NormalizedFields;
}

export interface ReconciliationItem {
  /** Present only for "ambiguous", in the same deterministic order as the actual-state input. */
  readonly actualCandidates: readonly ReconciliationActualCandidate[] | undefined;
  readonly actualFields: Readonly<Record<string, string>> | undefined;
  /** Present only for "ambiguous"; always equals actualCandidates.length and is at least two. */
  readonly actualMatchCount: number | undefined;
  readonly desiredFields: Readonly<Record<string, string>> | undefined;
  /** Field names (including the synthetic "disabled") that differ between desired and actual. Only set for "drifted". */
  readonly differingFields: readonly string[] | undefined;
  readonly reference: string;
  readonly resourceType: SyncResourceType;
  readonly status: ReconciliationStatus;
}
