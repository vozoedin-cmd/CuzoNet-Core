import type { InventoryEquipmentReference } from '../../application/ports/monitoring/inventory.reader.js';
import type {
  RouterOsCredentialProvider,
  RouterOsCredentials,
} from '../../application/ports/monitoring/routeros-credential-provider.port.js';
import { ManagementHost } from '../../domain/inventory/management-host.js';

export interface EnvironmentRouterOsCredentialProviderOptions {
  host?: string | undefined;
  password?: string | undefined;
  port?: number | undefined;
  timeoutMs: number;
  tls: boolean;
  username?: string | undefined;
}

export class EnvironmentRouterOsCredentialProvider implements RouterOsCredentialProvider {
  private readonly credentials: RouterOsCredentials | null;

  public constructor(options: EnvironmentRouterOsCredentialProviderOptions) {
    if (!Number.isInteger(options.timeoutMs) || options.timeoutMs < 1) {
      throw new RangeError('RouterOS timeoutMs debe ser un entero mayor que cero.');
    }
    const port = options.port ?? (options.tls ? 8729 : 8728);
    if (!Number.isInteger(port) || port < 1 || port > 65_535) {
      throw new RangeError('RouterOS port debe ser un puerto TCP válido.');
    }

    if (
      options.host === undefined ||
      options.username === undefined ||
      options.password === undefined
    ) {
      this.credentials = null;
      return;
    }

    const host = ManagementHost.create(options.host).value;
    const username = options.username.trim();
    if (username.length === 0) {
      throw new Error('RouterOS username no puede estar vacío.');
    }
    this.credentials = Object.freeze({
      host,
      password: options.password,
      port,
      timeoutMs: options.timeoutMs,
      tls: options.tls,
      username,
    });
  }

  public supports(equipment: InventoryEquipmentReference): boolean {
    if (this.credentials === null || equipment.managementHost === undefined) return false;
    try {
      return ManagementHost.create(equipment.managementHost).value === this.credentials.host;
    } catch {
      return false;
    }
  }

  public getCredentials(
    equipment: InventoryEquipmentReference,
  ): Promise<RouterOsCredentials | null> {
    return Promise.resolve(this.supports(equipment) ? this.credentials : null);
  }
}
