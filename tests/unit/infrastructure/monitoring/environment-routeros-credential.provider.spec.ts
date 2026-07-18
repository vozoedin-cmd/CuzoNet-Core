import { describe, expect, it } from 'vitest';

import type { InventoryEquipmentReference } from '../../../../backend/application/ports/monitoring/inventory.reader.js';
import { EnvironmentRouterOsCredentialProvider } from '../../../../backend/infrastructure/monitoring/environment-routeros-credential.provider.js';

describe('EnvironmentRouterOsCredentialProvider', () => {
  it('entrega credenciales sólo al equipo cuyo ManagementHost coincide', async () => {
    const provider = new EnvironmentRouterOsCredentialProvider({
      host: ' Router.EXAMPLE.COM ',
      password: 'secret',
      timeoutMs: 4_000,
      tls: true,
      username: ' monitoring ',
    });
    const matching = equipment({ managementHost: 'router.example.com' });
    const other = equipment({ id: 'router-2', managementHost: 'other.example.com' });

    expect(provider.supports(matching)).toBe(true);
    expect(provider.supports(other)).toBe(false);
    await expect(provider.getCredentials(matching)).resolves.toEqual({
      host: 'router.example.com',
      password: 'secret',
      port: 8729,
      timeoutMs: 4_000,
      tls: true,
      username: 'monitoring',
    });
    await expect(provider.getCredentials(other)).resolves.toBeNull();
  });

  it('usa 8728 por defecto cuando TLS está deshabilitado', async () => {
    const provider = new EnvironmentRouterOsCredentialProvider({
      host: '192.0.2.1',
      password: '',
      timeoutMs: 2_000,
      tls: false,
      username: 'api',
    });

    await expect(
      provider.getCredentials(equipment({ managementHost: '192.0.2.1' })),
    ).resolves.toMatchObject({ password: '', port: 8728, tls: false });
  });

  it('queda deshabilitado si falta una variable contractual', async () => {
    const provider = new EnvironmentRouterOsCredentialProvider({
      host: 'router.example.com',
      timeoutMs: 2_000,
      tls: true,
      username: 'api',
    });
    const item = equipment({ managementHost: 'router.example.com' });

    expect(provider.supports(item)).toBe(false);
    await expect(provider.getCredentials(item)).resolves.toBeNull();
  });

  it.each([
    [
      {
        host: 'https://router.example.com',
        password: 'x',
        timeoutMs: 1_000,
        tls: true,
        username: 'api',
      },
    ],
    [
      {
        host: 'router.example.com',
        password: 'x',
        port: 70_000,
        timeoutMs: 1_000,
        tls: true,
        username: 'api',
      },
    ],
    [{ host: 'router.example.com', password: 'x', timeoutMs: 0, tls: true, username: 'api' }],
  ])('rechaza configuración inválida', (options) => {
    expect(() => new EnvironmentRouterOsCredentialProvider(options)).toThrow();
  });
});

function equipment(
  overrides: Partial<InventoryEquipmentReference> = {},
): InventoryEquipmentReference {
  return {
    capabilities: {},
    companyId: 'company-1',
    id: 'router-1',
    role: 'core',
    status: 'active',
    type: 'router',
    ...overrides,
  };
}
