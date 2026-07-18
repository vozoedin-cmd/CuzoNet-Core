import type { InventoryEquipmentReference } from '../../application/ports/monitoring/inventory.reader.js';
import type {
  MonitoringTarget,
  MonitoringTargetResolver,
} from '../../application/ports/monitoring/monitoring-target-resolver.port.js';
import { ManagementHost } from '../../domain/inventory/management-host.js';

export class InventoryMonitoringTargetResolver implements MonitoringTargetResolver {
  public resolve(equipment: InventoryEquipmentReference): MonitoringTarget | null {
    if (equipment.managementHost === undefined) return null;

    try {
      return { host: ManagementHost.create(equipment.managementHost).value };
    } catch {
      return null;
    }
  }
}
