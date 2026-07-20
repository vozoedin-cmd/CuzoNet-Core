import type { SecretProviderPort } from '../../../application/ports/provisioning/routeros/secret-provider.port.js';

export class EnvironmentSecretProvider implements SecretProviderPort {
  public async getSecret(secretReference: string): Promise<string | null> {
    const value = process.env[secretReference];
    return typeof value === 'string' && value.trim().length > 0 ? value : null;
  }
}
