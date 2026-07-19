import type {
  NotificationChannel,
  NotificationChannelSendInput,
  NotificationSendResult,
  WhatsAppNotificationCredentials,
} from '../../application/ports/notifications/channels.js';
import { isRetryableHttpStatus } from '../../domain/notifications/notification-retry-policy.js';
import { normalizeWhatsAppRecipient, maskWhatsAppRecipient } from './whatsapp-utils.js';

export interface EvolutionApiWhatsAppNotificationChannelOptions {
  allowHttp?: boolean;
  fetchImplementation?: typeof fetch;
  maxTextLength?: number;
  timeoutMs?: number;
}

export class EvolutionApiWhatsAppNotificationChannel implements NotificationChannel {
  public readonly type = 'whatsapp' as const;
  private readonly allowHttp: boolean;
  private readonly fetchImplementation: typeof fetch;
  private readonly maxTextLength: number;
  private readonly defaultTimeoutMs: number;

  public constructor(options: EvolutionApiWhatsAppNotificationChannelOptions = {}) {
    this.allowHttp = options.allowHttp ?? false;
    this.fetchImplementation = options.fetchImplementation ?? fetch;
    this.maxTextLength = options.maxTextLength ?? 4096;
    this.defaultTimeoutMs = options.timeoutMs ?? 5_000;
  }

  public async send(input: NotificationChannelSendInput): Promise<NotificationSendResult> {
    if (input.credentials.channel !== 'whatsapp') {
      return permanent('WHATSAPP_CONFIGURATION_MISSING', 'Credenciales no corresponden a WhatsApp.');
    }

    const { credentials } = input;
    const address = input.destination.props.address;

    if (typeof address !== 'string' || address.trim().length === 0) {
      return permanent('INVALID_DESTINATION', 'El destino no tiene un número telefónico configurado.');
    }

    let number: string;
    try {
      number = normalizeWhatsAppRecipient(address, credentials.defaultCountryCode);
    } catch (error) {
      return permanent(
        'INVALID_DESTINATION',
        error instanceof Error ? error.message : 'Número de WhatsApp inválido.',
      );
    }

    const text = input.rendered.text;
    if (text.length > this.maxTextLength) {
      return permanent('MESSAGE_TOO_LONG', 'El mensaje excede la longitud máxima permitida.');
    }

    const urlError = this.validateUrl(credentials);
    if (urlError !== null) return urlError;

    const targetUrl = new URL(
      `/message/sendText/${encodeURIComponent(credentials.instanceName)}`,
      credentials.baseUrl,
    ).toString();

    const controller = new AbortController();
    const timeoutMs = credentials.timeoutMs ?? this.defaultTimeoutMs;
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    timeout.unref();

    try {
      const response = await this.fetchImplementation(targetUrl, {
        body: JSON.stringify({ number, text }),
        headers: {
          apikey: credentials.apiKey,
          'content-type': 'application/json',
        },
        method: 'POST',
        redirect: 'manual',
        signal: controller.signal,
      });

      if (response.status >= 200 && response.status <= 299) {
        let providerMessageId: string | undefined;
        try {
          const json = await response.json();
          if (json && typeof json === 'object' && 'key' in json && json.key && typeof (json.key as any).id === 'string') {
             // Example based on usual Evolution API response: { key: { id: "msg_id" } }
             providerMessageId = (json.key as any).id;
          }
        } catch {
          // Ignore invalid JSON on success
        }
        return {
          responseCode: response.status,
          type: 'success',
          ...(providerMessageId ? { providerMessageId } : {}),
          safeMetadata: { maskedRecipient: maskWhatsAppRecipient(address) },
        };
      }

      if (response.status >= 300 && response.status <= 399) {
        return permanent('HTTP_REDIRECT_BLOCKED', 'El proveedor respondió con una redirección bloqueada.');
      }

      const failure = {
        errorCode: `HTTP_${response.status}`,
        errorMessage: `El proveedor respondió HTTP ${response.status}.`,
        responseCode: response.status,
        safeMetadata: { maskedRecipient: maskWhatsAppRecipient(address) },
      };

      return isRetryableHttpStatus(response.status)
        ? { ...failure, type: 'retryableFailure' }
        : { ...failure, type: 'permanentFailure' };
    } catch (error) {
      if (controller.signal.aborted) {
        return {
          errorCode: 'TIMEOUT',
          errorMessage: 'Evolution API excedió el tiempo máximo.',
          type: 'retryableFailure',
          safeMetadata: { maskedRecipient: maskWhatsAppRecipient(address) },
        };
      }
      return {
        errorCode: 'NETWORK_ERROR',
        errorMessage: error instanceof Error ? error.message : 'Fallo de conexión a Evolution API.',
        type: 'retryableFailure',
        safeMetadata: { maskedRecipient: maskWhatsAppRecipient(address) },
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  private validateUrl(
    credentials: WhatsAppNotificationCredentials,
  ): NotificationSendResult | null {
    let parsed: URL;
    try {
      parsed = new URL(credentials.baseUrl);
    } catch {
      return permanent('INVALID_DESTINATION', 'La URL base de Evolution API no es válida.');
    }
    if (parsed.protocol !== 'https:' && !(this.allowHttp && parsed.protocol === 'http:')) {
      return permanent('INSECURE_DESTINATION', 'Evolution API debe usar HTTPS.');
    }
    return null;
  }
}

function permanent(errorCode: string, errorMessage: string): NotificationSendResult {
  return { errorCode, errorMessage, type: 'permanentFailure' };
}
