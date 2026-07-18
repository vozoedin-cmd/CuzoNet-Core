import type { InventoryEquipmentReference } from './inventory.reader.js';

export interface MonitoringTarget {
  host: string;
}

export interface MonitoringTargetResolver {
  resolve(equipment: InventoryEquipmentReference): MonitoringTarget | null;
}
