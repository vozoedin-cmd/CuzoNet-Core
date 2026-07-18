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

describe('CollectorRegistry multi-collector selection', () => {
  it('mantiene Ping y SNMP en orden y excluye NoOp cuando hay collectors reales', () => {
    const ping = collector(true);
    const snmp = collector(true);
    const noOp = new NoOpCollector();
    const registry = new CollectorRegistry([ping, snmp, noOp]);

    expect(registry.findAllFor(equipment)).toEqual([ping, snmp]);
    expect(registry.findFor(equipment)).toBe(ping);
  });

  it('usa NoOp únicamente como fallback', () => {
    const ping = collector(false);
    const snmp = collector(false);
    const noOp = new NoOpCollector();
    const registry = new CollectorRegistry([ping, snmp, noOp]);

    expect(registry.findAllFor(equipment)).toEqual([noOp]);
  });
});

function collector(supported: boolean): MonitoringCollector {
  return {
    collect: vi.fn().mockResolvedValue([]),
    supports: vi.fn().mockReturnValue(supported),
  };
}
