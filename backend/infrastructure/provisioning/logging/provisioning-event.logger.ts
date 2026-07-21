import type { ProvisioningEventLogger } from '../../../application/use-cases/provisioning/shared/publish-provisioning-events.js';
import { logger } from '../../logging/logger.js';

/** Structured logging for provisioning domain-event publication, backed by the shared pino logger. */
export class PinoProvisioningEventLogger implements ProvisioningEventLogger {
  public info(fields: Readonly<Record<string, unknown>>): void {
    logger.info(
      { action: 'provisioning.event.publish', module: 'provisioning', ...fields },
      'provisioning_event_published',
    );
  }

  public warn(fields: Readonly<Record<string, unknown>>): void {
    logger.warn(
      { action: 'provisioning.event.publish', module: 'provisioning', ...fields },
      'provisioning_event_publish_failed',
    );
  }
}
