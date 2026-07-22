import type { SyncResourceType } from '../../../domain/synchronization/sync-resource-type.js';

/** Re-exported so the api layer (which must never import domain directly) can validate resourceType path params against the real vocabulary. */
export { SYNC_RESOURCE_TYPES } from '../../../domain/synchronization/sync-resource-type.js';
export type { SyncResourceType } from '../../../domain/synchronization/sync-resource-type.js';

export interface DesiredResourceStateDto {
  companyId: string;
  createdAt: string;
  desiredFields: Record<string, string>;
  desiredPosition?: number;
  disabled: boolean;
  reference: string;
  resourceType: SyncResourceType;
  revision: number;
  routerId: string;
  updatedAt: string;
}

export interface SetDesiredResourceStateInput {
  desiredFields: Record<string, string>;
  desiredPosition?: number;
  disabled?: boolean;
  reference: string;
  resourceType: SyncResourceType;
  routerId: string;
}

export interface DesiredResourceStateIdentity {
  reference: string;
  resourceType: SyncResourceType;
  routerId: string;
}
