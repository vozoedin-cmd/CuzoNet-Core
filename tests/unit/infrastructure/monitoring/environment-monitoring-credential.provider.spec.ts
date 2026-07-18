import { describe, expect, it } from 'vitest';

import type { InventoryEquipmentReference } from '../../../../backend/application/ports/monitoring/inventory.reader.js';
import { EnvironmentMonitoringCredentialProvider } from '../../../../backend/infrastructure/monitoring/environment-monitoring-credential.provider.js';

const equipment: InventoryEquipmentReference = {
  capabilities: {},
  companyId: 'company-1',
  id: 'equipment-1',
  managementHost: 'router.example.com',
  role: 'core',
  status: 'active',
  type: 'router',
};

describe('EnvironmentMonitoringCredentialProvider', () => {
  it('entrega credenciales SNMP v2c normalizadas sin acceder a persistencia', async () => {
    const provider = new EnvironmentMonitoringCredentialProvider({
      community: '  private-community  ',
      retries: 2,
      timeoutMs: 2_500,
    });

    await expect(provider.getSnmpV2cCredentials(equipment)).resolves.toEqual({
      community: 'private-community',
      retries: 2,
      timeoutMs: 2_500,
      version: '2c',
    });
  });

  it('devuelve null cuando la community no está configurada', async () => {
    const provider = new EnvironmentMonitoringCredentialProvider({
      retries: 1,
      timeoutMs: 3_000,
    });

    await expect(provider.getSnmpV2cCredentials(equipment)).resolves.toBeNull();
  });

  it.each([
    [{ retries: -1, timeoutMs: 1_000 }, 'retries'],
    [{ retries: 1, timeoutMs: 0 }, 'timeoutMs'],
  ])('rechaza configuración inválida', (options, expectedMessage) => {
    expect(() => new EnvironmentMonitoringCredentialProvider(options)).toThrow(expectedMessage);
  });
});
