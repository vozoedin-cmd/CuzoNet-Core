export interface SecretProviderPort {
  getSecret(secretReference: string): Promise<string | null>;
}
