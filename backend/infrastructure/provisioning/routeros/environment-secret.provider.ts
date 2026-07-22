import type { SecretProviderPort } from '../../../application/ports/provisioning/routeros/secret-provider.port.js';
import { logger } from '../../logging/logger.js';

export class EnvironmentSecretProvider implements SecretProviderPort {
  public async getSecret(secretReference: string): Promise<string | null> {
    const value = process.env[secretReference];
    // TEMPORAL: diagnóstico de EnvironmentSecretProvider — remover una vez confirmada la causa.
    // Nunca registra el valor del secreto, solo si existe y su longitud.
    logger.warn(
      {
        exists: value !== undefined,
        secretReference,
        valueLength: value?.length ?? 0,
      },
      'environment_secret_provider_lookup',
    );
    return typeof value === 'string' && value.trim().length > 0 ? value : null;
  }
}
