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
    return { channel: input.channel, configurationReference: reference };
  }
}
