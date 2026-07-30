import type {
  ReconciliationMode,
  ReconciliationSummary,
} from '../../../domain/synchronization/reconciliation-plan.js';
import type { ReconciliationStatus } from '../../../domain/synchronization/reconciliation-status.js';
import type { SyncResourceType } from '../../../domain/synchronization/sync-resource-type.js';

/** Re-exported so the api layer (which must never import domain directly) can validate resourceType query params against the real vocabulary. */
export { SYNC_RESOURCE_TYPES } from '../../../domain/synchronization/sync-resource-type.js';
export type { SyncResourceType } from '../../../domain/synchronization/sync-resource-type.js';

export interface ReconciliationActualCandidateDto {
  disabled: boolean;
  fields: Record<string, string>;
}

export interface ReconciliationItemDto {
  actualCandidates?: ReconciliationActualCandidateDto[];
  actualFields?: Record<string, string>;
  actualMatchCount?: number;
  desiredFields?: Record<string, string>;
  differingFields?: string[];
  reference: string;
  resourceType: SyncResourceType;
  status: ReconciliationStatus;
}

export interface ReconciliationPlanDto {
  companyId: string;
  generatedAt: string;
  items: ReconciliationItemDto[];
  mode: ReconciliationMode;
  routerId: string;
  summary: ReconciliationSummary;
}

export interface GenerateReconciliationPlanInput {
  resourceTypes?: SyncResourceType[];
  routerId: string;
}
