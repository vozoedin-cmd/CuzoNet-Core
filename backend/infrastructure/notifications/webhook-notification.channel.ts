import type {
  NotificationChannel,
  NotificationChannelSendInput,
  NotificationSendResult,
  WebhookNotificationCredentials,
} from '../../application/ports/notifications/channels.js';
import { isRetryableHttpStatus } from '../../domain/notifications/notification-retry-policy.js';

export interface WebhookNotificationChannelOptions {
  allowHttp?: boolean;
  fetchImplementation?: typeof fetch;
  timeoutMs?: number;
}

export class WebhookNotificationChannel implements NotificationChannel {
  public readonly type = 'webhook' as const;
  private readonly allowHttp: boolean;
  private readonly fetchImplementation: typeof fetch;
  private readonly timeoutMs: number;

  public constructor(options: WebhookNotificationChannelOptions = {}) {
    this.allowHttp = options.allowHttp ?? false;
    this.fetchImplementation = options.fetchImplementation ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 5_000;
    if (!Number.isInteger(this.timeoutMs) || this.timeoutMs < 100)
      throw new RangeError('timeoutMs debe ser un entero de al menos 100 ms.');
  }

  public async send(input: NotificationChannelSendInput): Promise<NotificationSendResult> {
    if (input.credentials.channel !== 'webhook')
      return permanent('INVALID_CREDENTIALS', 'Las credenciales no corresponden a Webhook.');
    const url = this.validateUrl(input.credentials);
    if (typeof url !== 'string') return url;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    timeout.unref();
    try {
      const response = await this.fetchImplementation(url, {
        body: JSON.stringify(input.rendered.structuredPayload ?? { text: input.rendered.text }),
        headers: {
          'content-type': 'application/json',
          ...(input.credentials.bearerToken === undefined
            ? {}
            : { authorization: `Bearer ${input.credentials.bearerToken}` }),
        },
        method: 'POST',
        redirect: 'manual',
        signal: controller.signal,
      });
      if (response.status >= 200 && response.status <= 299)
        return { responseCode: response.status, type: 'success' };
      if (response.status >= 300 && response.status <= 399)
        return {
          errorCode: 'HTTP_REDIRECT_BLOCKED',
          errorMessage: 'El proveedor respondió con una redirección bloqueada.',
          responseCode: response.status,
          type: 'permanentFailure',
        };
      const failure = {
        errorCode: `HTTP_${response.status}`,
        errorMessage: `El proveedor respondió HTTP ${response.status}.`,
        responseCode: response.status,
      };
      return isRetryableHttpStatus(response.status)
        ? { ...failure, type: 'retryableFailure' }
        : { ...failure, type: 'permanentFailure' };
    } catch (error) {
      if (controller.signal.aborted)
        return {
          errorCode: 'TIMEOUT',
          errorMessage: 'El webhook excedió el tiempo máximo.',
          type: 'retryableFailure',
        };
      return {
        errorCode: 'NETWORK_ERROR',
        errorMessage: error instanceof Error ? error.message : 'Fallo de conexión al webhook.',
        type: 'retryableFailure',
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  private validateUrl(
    credentials: WebhookNotificationCredentials,
  ): string | NotificationSendResult {
    let parsed: URL;
    try {
      parsed = new URL(credentials.url);
    } catch {
      return permanent('INVALID_DESTINATION', 'La URL del webhook no es válida.');
    }
    if (parsed.username.length > 0 || parsed.password.length > 0)
      return permanent('INVALID_DESTINATION', 'La URL del webhook no puede contener credenciales.');
    if (parsed.protocol !== 'https:' && !(this.allowHttp && parsed.protocol === 'http:'))
      return permanent('INSECURE_DESTINATION', 'El webhook debe usar HTTPS.');
    return parsed.toString();
  }
}

function permanent(errorCode: string, errorMessage: string): NotificationSendResult {
  return { errorCode, errorMessage, type: 'permanentFailure' };
}
