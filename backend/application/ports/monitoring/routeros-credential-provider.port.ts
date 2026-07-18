import type { InventoryEquipmentReference } from './inventory.reader.js';

export interface RouterOsCredentials {
  readonly host: string;
  readonly password: string;
  readonly port: number;
  readonly timeoutMs: number;
  readonly tls: boolean;
  readonly username: string;
}

export interface RouterOsCredentialProvider {
  supports(equipment: InventoryEquipmentReference): boolean;
  getCredentials(equipment: InventoryEquipmentReference): Promise<RouterOsCredentials | null>;
}
