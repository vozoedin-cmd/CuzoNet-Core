import { describe, expect, it, vi } from 'vitest';

import type { InventoryEquipmentReference } from '../../../../backend/application/ports/monitoring/inventory.reader.js';
import type { MonitoringCollector } from '../../../../backend/application/ports/monitoring/monitoring-collector.port.js';
import { CollectorRegistry } from '../../../../backend/infrastructure/monitoring/collector-registry.js';

const equipment: InventoryEquipmentReference = {
  capabilities: {},
  companyId: 'company-1',
  id: 'equipment-1',
  role: 'core',
  status: 'active',
  type: 'router',
};

describe('CollectorRegistry', () => {
  it('selecciona el primer collector compatible sin conocer su implementación', () => {
    const unsupported: MonitoringCollector = {
      collect: vi.fn().mockResolvedValue([]),
      supports: vi.fn().mockReturnValue(false),
    };
    const compatible: MonitoringCollector = {
      collect: vi.fn().mockResolvedValue([]),
      supports: vi.fn().mockReturnValue(true),
    };
    const later: MonitoringCollector = {
      collect: vi.fn().mockResolvedValue([]),
      supports: vi.fn().mockReturnValue(true),
    };
    const registry = new CollectorRegistry([unsupported, compatible, later]);

    expect(registry.findFor(equipment)).toBe(compatible);
    expect(unsupported.supports).toHaveBeenCalledWith(equipment);
    expect(compatible.supports).toHaveBeenCalledWith(equipment);
    expect(later.supports).not.toHaveBeenCalled();
  });

  it('devuelve null cuando no existe un collector compatible', () => {
    const registry = new CollectorRegistry([
      {
        collect: vi.fn().mockResolvedValue([]),
        supports: vi.fn().mockReturnValue(false),
      },
    ]);

    expect(registry.findFor(equipment)).toBeNull();
  });

  it('permite registrar collectors después de construir el registro', () => {
    const collector: MonitoringCollector = {
      collect: vi.fn().mockResolvedValue([]),
      supports: vi.fn().mockReturnValue(true),
    };
    const registry = new CollectorRegistry();

    registry.register(collector);

    expect(registry.findFor(equipment)).toBe(collector);
  });
});
