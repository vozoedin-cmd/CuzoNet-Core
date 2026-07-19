import type {
  NotificationCredentialProvider,
  NotificationCredentials,
} from '../../application/ports/notifications/channels.js';

export class EnvironmentNotificationCredentialProvider implements NotificationCredentialProvider {
  public constructor(private readonly values: NodeJS.ProcessEnv = process.env) {}

  public async get(
    input: Parameters<NotificationCredentialProvider['get']>[0],
  ): Promise<NotificationCredentials | null> {
    const reference = input.destination.props.configurationReference;
    if (input.channel === 'webhook') {
      const url = this.values[`${reference}_URL`];
      if (url === undefined || url.trim().length === 0) return null;
      const bearerToken = this.values[`${reference}_BEARER_TOKEN`];
      return {
        ...(bearerToken === undefined || bearerToken.length === 0 ? {} : { bearerToken }),
        channel: 'webhook',
        url,
      };
    }
    if (input.channel === 'whatsapp') {
      const baseUrl = this.values[`${reference}_BASE_URL`];
      const apiKey = this.values[`${reference}_API_KEY`];
      const instanceName = this.values[`${reference}_INSTANCE_NAME`];
      if (!baseUrl || !apiKey || !instanceName) return null;
      
      const defaultCountryCode = this.values[`${reference}_DEFAULT_COUNTRY_CODE`];
      const timeoutStr = this.values[`${reference}_TIMEOUT_MS`];
      const timeoutMs = timeoutStr ? parseInt(timeoutStr, 10) : undefined;
      
      return {
        apiKey,
        baseUrl,
        channel: 'whatsapp',
        ...(defaultCountryCode ? { defaultCountryCode } : {}),
        instanceName,
        ...(timeoutMs && !isNaN(timeoutMs) ? { timeoutMs } : {}),
      };
    }
    return { channel: input.channel as 'email' | 'telegram', configurationReference: reference };
  }
}
