import type { InventoryEquipmentReference } from '../../application/ports/monitoring/inventory.reader.js';
import type { MonitoringCollector } from '../../application/ports/monitoring/monitoring-collector.port.js';

export class CollectorRegistry {
  private readonly collectors: MonitoringCollector[] = [];

  public constructor(collectors: readonly MonitoringCollector[] = []) {
    for (const collector of collectors) this.register(collector);
  }

  public register(collector: MonitoringCollector): void {
    if (this.collectors.includes(collector)) return;
    this.collectors.push(collector);
  }

  public findFor(equipment: InventoryEquipmentReference): MonitoringCollector | null {
    return this.collectors.find((collector) => collector.supports(equipment)) ?? null;
  }

  public findAllFor(equipment: InventoryEquipmentReference): MonitoringCollector[] {
    const supported = this.collectors.filter((collector) => collector.supports(equipment));
    const activeCollectors = supported.filter((collector) => collector.fallback !== true);
    return activeCollectors.length > 0 ? activeCollectors : supported.slice(0, 1);
  }
}
