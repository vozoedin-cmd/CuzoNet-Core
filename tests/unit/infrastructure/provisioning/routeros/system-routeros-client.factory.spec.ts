import { describe, it, expect } from 'vitest';

import { SystemRouterOsClientFactory } from '../../../../../backend/infrastructure/provisioning/routeros/system-routeros-client.factory.js';

describe('SystemRouterOsClientFactory', () => {
  it('should throw ROUTEROS_PROVISIONING_DISABLED without attempting any TCP connection when disabled explicitly', async () => {
    // Inyectado explícitamente (no vía process.env/environment): `environment` es un singleton
    // congelado en el momento del import, así que su valor no puede aislarse entre tests. Ver
    // el comentario en SystemRouterOsClientFactory para el detalle completo.
    const factory = new SystemRouterOsClientFactory(false);

    let error: Error | undefined;
    try {
      await factory.create(
        {
          host: '127.0.0.1',
          port: 8728,
          secretReference: 'SECRET',
          timeoutMs: 1000,
          tls: false,
          username: 'admin',
        },
        'secret',
      );
    } catch (e: unknown) {
      error = e as Error;
    }

    expect(error).not.to.equal(undefined);
    expect(error?.message).to.equal('ROUTEROS_PROVISIONING_DISABLED');
  });

  it('should default to the real environment configuration when no value is injected', () => {
    const factory = new SystemRouterOsClientFactory();

    expect(factory).to.be.instanceOf(SystemRouterOsClientFactory);
  });
});
