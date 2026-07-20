import { describe, it, expect } from 'vitest';

import { SystemRouterOsClientFactory } from '../../../../../backend/infrastructure/provisioning/routeros/system-routeros-client.factory.js';

describe('SystemRouterOsClientFactory', () => {
  it('should throw an error if environment ROUTEROS_PROVISIONING_ENABLED is false', async () => {
    const factory = new SystemRouterOsClientFactory();
    
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
});
