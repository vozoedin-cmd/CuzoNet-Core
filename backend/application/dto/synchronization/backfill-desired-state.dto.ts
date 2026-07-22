import type { SyncResourceType } from '../../../domain/synchronization/sync-resource-type.js';

export interface BackfillDesiredStateInput {
  dryRun: boolean;
  resourceTypes?: SyncResourceType[];
  routerIds?: string[];
}

export interface BackfillRouterResourceResult {
  created: number;
  resourceType: SyncResourceType;
  routerId: string;
  scanned: number;
  skipped: number;
}

export interface BackfillTotals {
  created: number;
  routersScanned: number;
  scanned: number;
  skipped: number;
}

export interface BackfillSummaryDto {
  dryRun: boolean;
  perRouter: BackfillRouterResourceResult[];
  totals: BackfillTotals;
}
