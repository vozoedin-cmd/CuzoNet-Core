import type {
  MonitoringCredentialProvider,
  SnmpV2cCredentials,
} from '../../application/ports/monitoring/monitoring-credential-provider.port.js';
import type { InventoryEquipmentReference } from '../../application/ports/monitoring/inventory.reader.js';

export interface EnvironmentMonitoringCredentialProviderOptions {
  community?: string | undefined;
  retries: number;
  timeoutMs: number;
}

export class EnvironmentMonitoringCredentialProvider implements MonitoringCredentialProvider {
  private readonly credentials: SnmpV2cCredentials | null;

  public constructor(options: EnvironmentMonitoringCredentialProviderOptions) {
    if (!Number.isInteger(options.timeoutMs) || options.timeoutMs < 1) {
      throw new RangeError('SNMP timeoutMs debe ser un entero mayor que cero.');
    }
    if (!Number.isInteger(options.retries) || options.retries < 0) {
      throw new RangeError('SNMP retries debe ser un entero no negativo.');
    }

    const community = options.community?.trim();
    this.credentials =
      community === undefined || community.length === 0
        ? null
        : Object.freeze({
            community,
            retries: options.retries,
            timeoutMs: options.timeoutMs,
            version: '2c' as const,
          });
  }

  public getSnmpV2cCredentials(
    _equipment: InventoryEquipmentReference,
  ): Promise<SnmpV2cCredentials | null> {
    return Promise.resolve(this.credentials);
  }
}
