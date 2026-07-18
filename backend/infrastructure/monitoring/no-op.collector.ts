import type { InventoryEquipmentReference } from '../../application/ports/monitoring/inventory.reader.js';
import type { MonitoringCollector } from '../../application/ports/monitoring/monitoring-collector.port.js';
import type { Observation } from '../../domain/monitoring/observation.js';

export class NoOpCollector implements MonitoringCollector {
  public readonly fallback = true;

  public supports(_equipment: InventoryEquipmentReference): boolean {
    return true;
  }

  public collect(_equipment: InventoryEquipmentReference): Promise<Observation[]> {
    return Promise.resolve([]);
  }
}
