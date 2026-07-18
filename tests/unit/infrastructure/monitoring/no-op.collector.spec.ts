import { describe, expect, it } from 'vitest';

import type { InventoryEquipmentReference } from '../../../../backend/application/ports/monitoring/inventory.reader.js';
import { NoOpCollector } from '../../../../backend/infrastructure/monitoring/no-op.collector.js';

const equipment: InventoryEquipmentReference = {
  capabilities: {},
  companyId: 'company-1',
  id: 'equipment-1',
  role: 'core',
  status: 'active',
  type: 'router',
};

describe('NoOpCollector', () => {
  it('acepta cualquier equipo y no consulta red ni produce observaciones', async () => {
    const collector = new NoOpCollector();

    expect(collector.supports(equipment)).toBe(true);
    await expect(collector.collect(equipment)).resolves.toEqual([]);
  });
});
