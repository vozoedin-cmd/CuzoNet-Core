import type { ProvisioningEventEnvelope } from './provisioning-event-envelope.js';

/**
 * Delivers a ProvisioningRequest lifecycle event (already read from the
 * Outbox by the ProvisioningEventDispatcher) to an external consumer
 * (n8n, WhatsApp, dashboards, audit, ...). Implementations must throw on
 * failure so the dispatcher can retry; they must never receive or forward
 * secrets, since the envelope's payload never carries any.
 */
export interface ProvisioningEventPublisherPort {
  publish(event: ProvisioningEventEnvelope): Promise<void>;
}
