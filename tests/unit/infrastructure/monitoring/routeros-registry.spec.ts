import { describe, expect, it, vi } from 'vitest';

import type { InventoryEquipmentReference } from '../../../../backend/application/ports/monitoring/inventory.reader.js';
import type { MonitoringCollector } from '../../../../backend/application/ports/monitoring/monitoring-collector.port.js';
import { CollectorRegistry } from '../../../../backend/infrastructure/monitoring/collector-registry.js';
import { NoOpCollector } from '../../../../backend/infrastructure/monitoring/no-op.collector.js';

const equipment: InventoryEquipmentReference = {
  capabilities: {},
  companyId: 'company-1',
  id: 'router-1',
  managementHost: 'router.example.com',
  role: 'core',
  status: 'active',
  type: 'router',
};

describe('RouterOS collector registration', () => {
  it('mantiene Ping, SNMP y RouterOS en orden y NoOp sólo como fallback', () => {
    const ping = collector(true);
    const snmp = collector(true);
    const routerOs = collector(true);
    const noOp = new NoOpCollector();
    const registry = new CollectorRegistry([ping, snmp, routerOs, noOp]);

    expect(registry.findAllFor(equipment)).toEqual([ping, snmp, routerOs]);
  });
});

function collector(supported: boolean): MonitoringCollector {
  return {
    collect: vi.fn().mockResolvedValue([]),
    supports: vi.fn().mockReturnValue(supported),
  };
}
