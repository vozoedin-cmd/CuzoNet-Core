import { describe, expect, it } from 'vitest';

import type { InventoryEquipmentReference } from '../../../../backend/application/ports/monitoring/inventory.reader.js';
import { InventoryMonitoringTargetResolver } from '../../../../backend/infrastructure/monitoring/inventory-monitoring-target-resolver.js';

describe('InventoryMonitoringTargetResolver', () => {
  const resolver = new InventoryMonitoringTargetResolver();

  it('obtiene y normaliza el destino desde managementHost', () => {
    expect(resolver.resolve(equipment({ managementHost: ' Router.EXAMPLE.COM ' }))).toEqual({
      host: 'router.example.com',
    });
  });

  it('devuelve null cuando el equipo no tiene managementHost', () => {
    expect(resolver.resolve(equipment())).toBeNull();
  });

  it('devuelve null para un valor que viola el contrato', () => {
    expect(
      resolver.resolve(equipment({ managementHost: 'https://router.example.com' })),
    ).toBeNull();
  });
});

function equipment(
  overrides: Partial<InventoryEquipmentReference> = {},
): InventoryEquipmentReference {
  return {
    capabilities: {},
    companyId: 'company-1',
    id: 'equipment-1',
    role: 'core',
    status: 'active',
    type: 'router',
    ...overrides,
  };
}
