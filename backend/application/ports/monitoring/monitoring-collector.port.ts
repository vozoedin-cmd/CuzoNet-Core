import type { InventoryEquipmentReference } from './inventory.reader.js';
import type { Observation } from '../../../domain/monitoring/observation.js';

export interface MonitoringCollector {
  supports(equipment: InventoryEquipmentReference): boolean;
  collect(equipment: InventoryEquipmentReference): Promise<Observation[]>;
}
