export const SYNC_RESOURCE_TYPES = [
  'simple-queue',
  'address-list-entry',
  'filter-rule',
  'nat-rule',
  'mangle-rule',
] as const;

export type SyncResourceType = (typeof SYNC_RESOURCE_TYPES)[number];
