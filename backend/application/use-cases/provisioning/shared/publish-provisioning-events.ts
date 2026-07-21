import type { OutboxPort } from '../../../ports/provisioning/outbox.port.js';
import type { ProvisioningRequestDomainEvent } from '../../../../domain/provisioning/events/provisioning-request-domain-event.js';

export interface ProvisioningEventLogger {
  info(fields: Readonly<Record<string, unknown>>): void;
  warn(fields: Readonly<Record<string, unknown>>): void;
}

export const noOpProvisioningEventLogger: ProvisioningEventLogger = {
  info: () => undefined,
  warn: () => undefined,
};

/**
 * Persists provisioning lifecycle events through the existing Outbox
 * (reused as-is, see OutboxPort) and logs {eventName, requestId,
 * attemptNumber, published, duration} per event — never the event payload
 * itself, so secrets can never leak through this path.
 *
 * Outbox failures are logged and swallowed rather than rethrown: the
 * request/attempt state has already been persisted by the caller by the
 * time this runs, and a transient outbox write failure must not be
 * mistaken for a provisioning failure.
 */
export async function publishProvisioningEvents(
  outbox: OutboxPort<ProvisioningRequestDomainEvent>,
  events: readonly ProvisioningRequestDomainEvent[],
  logger: ProvisioningEventLogger = noOpProvisioningEventLogger,
): Promise<void> {
  if (events.length === 0) return;

  const startedAt = Date.now();
  try {
    await outbox.append(events);
    const duration = Date.now() - startedAt;
    for (const event of events) {
      logger.info({
        attemptNumber: event.payload.attemptNumber,
        duration,
        eventName: event.eventType,
        published: true,
        requestId: event.payload.requestId,
      });
    }
  } catch (error) {
    const duration = Date.now() - startedAt;
    for (const event of events) {
      logger.warn({
        attemptNumber: event.payload.attemptNumber,
        duration,
        error: error instanceof Error ? error.message : String(error),
        eventName: event.eventType,
        published: false,
        requestId: event.payload.requestId,
      });
    }
  }
}
