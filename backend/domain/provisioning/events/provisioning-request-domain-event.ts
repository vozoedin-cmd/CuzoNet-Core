import type { ProvisioningFailedEvent } from './provisioning-failed.event.js';
import type { ProvisioningRequestedEvent } from './provisioning-requested.event.js';
import type { ProvisioningRetryScheduledEvent } from './provisioning-retry-scheduled.event.js';
import type { ProvisioningSucceededEvent } from './provisioning-succeeded.event.js';

/** Lifecycle events emitted by the ProvisioningRequest/ProvisioningAttempt engine (Simple Queue, PPPoE, Hotspot, Firewall Address Lists, ...). */
export type ProvisioningRequestDomainEvent =
  | ProvisioningRequestedEvent
  | ProvisioningSucceededEvent
  | ProvisioningFailedEvent
  | ProvisioningRetryScheduledEvent;
