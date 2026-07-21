/** The only ProvisioningRequest lifecycle event types any consumer may subscribe to. */
export const provisioningConsumableEventTypes = [
  'ProvisioningRequested.v1',
  'ProvisioningSucceeded.v1',
  'ProvisioningFailed.v1',
  'ProvisioningRetryScheduled.v1',
] as const;

export type ProvisioningConsumableEventType = (typeof provisioningConsumableEventTypes)[number];
