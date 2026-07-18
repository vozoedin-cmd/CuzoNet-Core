import type { InventoryEquipmentReference } from './inventory.reader.js';

export interface SnmpV2cCredentials {
  readonly community: string;
  readonly retries: number;
  readonly timeoutMs: number;
  readonly version: '2c';
}

export interface MonitoringCredentialProvider {
  getSnmpV2cCredentials(equipment: InventoryEquipmentReference): Promise<SnmpV2cCredentials | null>;
}
