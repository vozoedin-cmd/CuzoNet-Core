import { createHmac } from 'node:crypto';

import type { ProvisioningEventEnvelope } from '../../../application/ports/provisioning/provisioning-event-envelope.js';
import type { ProvisioningEventPublisherPort } from '../../../application/ports/provisioning/provisioning-event-publisher.port.js';
import type { SecretProviderPort } from '../../../application/ports/provisioning/routeros/secret-provider.port.js';
import { isRetryableHttpStatus } from '../../../domain/notifications/notification-retry-policy.js';

export interface WebhookEndpointConfig {
  /** Reference resolved via SecretProviderPort; the raw secret never lives in config. */
  readonly hmacSecretReference?: string;
  readonly url: string;
}

export interface WebhookProvisioningEventPublisherOptions {
  allowHttp?: boolean;
  baseRetryDelayMs?: number;
  fetchImplementation?: typeof fetch;
  maxAttemptsPerEndpoint?: number;
  timeoutMs?: number;
}

class WebhookDeliveryError extends Error {
  public constructor(
    message: string,
    public readonly retryable: boolean,
    public readonly responseStatus?: number,
  ) {
    super(message);
    this.name = 'WebhookDeliveryError';
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    timer.unref();
  });
}

/**
 * Delivers ProvisioningRequest lifecycle events to one or more external HTTP
 * endpoints (n8n and similar). Each event carries an Idempotency-Key header
 * (the event's own eventId) so consumers can safely de-duplicate retried or
 * fanned-out deliveries; an optional per-config HMAC signature lets
 * consumers verify authenticity. Retries here are a short, fast inner loop
 * for transient blips within a single publish() call — the
 * ProvisioningEventDispatcher already retries across polling cycles for
 * sustained outages, so this publisher never blocks longer than
 * `maxAttemptsPerEndpoint` short backoffs before handing failure back up.
 */
export class WebhookProvisioningEventPublisher implements ProvisioningEventPublisherPort {
  private readonly allowHttp: boolean;
  private readonly baseRetryDelayMs: number;
  private readonly fetchImplementation: typeof fetch;
  private readonly maxAttemptsPerEndpoint: number;
  private readonly timeoutMs: number;

  public constructor(
    private readonly endpoints: readonly WebhookEndpointConfig[],
    private readonly secretProvider: SecretProviderPort,
    options: WebhookProvisioningEventPublisherOptions = {},
  ) {
    if (endpoints.length === 0) {
      throw new Error('WebhookProvisioningEventPublisher requiere al menos un endpoint configurado.');
    }
    this.allowHttp = options.allowHttp ?? false;
    this.baseRetryDelayMs = options.baseRetryDelayMs ?? 500;
    this.fetchImplementation = options.fetchImplementation ?? fetch;
    this.maxAttemptsPerEndpoint = options.maxAttemptsPerEndpoint ?? 3;
    this.timeoutMs = options.timeoutMs ?? 5_000;
    if (!Number.isInteger(this.maxAttemptsPerEndpoint) || this.maxAttemptsPerEndpoint < 1) {
      throw new RangeError('maxAttemptsPerEndpoint debe ser un entero mayor o igual a uno.');
    }
    if (!Number.isInteger(this.timeoutMs) || this.timeoutMs < 100) {
      throw new RangeError('timeoutMs debe ser un entero de al menos 100 ms.');
    }
    for (const endpoint of endpoints) this.assertValidUrl(endpoint.url);
  }

  public async publish(event: ProvisioningEventEnvelope): Promise<void> {
    const body = JSON.stringify(event);
    const results = await Promise.allSettled(
      this.endpoints.map((endpoint) => this.deliverWithRetry(endpoint, event, body)),
    );
    const failures = results.filter((result): result is PromiseRejectedResult => result.status === 'rejected');
    if (failures.length > 0) {
      const reasons = failures.map((failure) =>
        failure.reason instanceof Error ? failure.reason.message : String(failure.reason),
      );
      throw new Error(
        `Fallo al publicar en ${failures.length}/${this.endpoints.length} endpoint(s) de webhook: ${reasons.join('; ')}`,
      );
    }
  }

  private async deliverWithRetry(
    endpoint: WebhookEndpointConfig,
    event: ProvisioningEventEnvelope,
    body: string,
  ): Promise<void> {
    for (let attempt = 1; attempt <= this.maxAttemptsPerEndpoint; attempt += 1) {
      try {
        await this.deliverOnce(endpoint, event, body);
        return;
      } catch (error) {
        const retryable = error instanceof WebhookDeliveryError ? error.retryable : true;
        if (!retryable || attempt >= this.maxAttemptsPerEndpoint) throw error;
        await sleep(this.baseRetryDelayMs * 2 ** (attempt - 1));
      }
    }
  }

  private async deliverOnce(
    endpoint: WebhookEndpointConfig,
    event: ProvisioningEventEnvelope,
    body: string,
  ): Promise<void> {
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      'idempotency-key': event.eventId,
      'x-provisioning-event-type': event.eventType,
    };
    if (endpoint.hmacSecretReference !== undefined) {
      const secret = await this.secretProvider.getSecret(endpoint.hmacSecretReference);
      if (secret === null) {
        throw new WebhookDeliveryError(
          `Secreto HMAC no encontrado para la referencia: ${endpoint.hmacSecretReference}`,
          false,
        );
      }
      headers['x-provisioning-signature'] = `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    timeout.unref();
    try {
      const response = await this.fetchImplementation(endpoint.url, {
        body,
        headers,
        method: 'POST',
        redirect: 'manual',
        signal: controller.signal,
      });
      if (response.status >= 200 && response.status <= 299) return;
      throw new WebhookDeliveryError(
        `El endpoint respondió HTTP ${response.status}.`,
        isRetryableHttpStatus(response.status),
        response.status,
      );
    } catch (error) {
      if (error instanceof WebhookDeliveryError) throw error;
      if (controller.signal.aborted) {
        throw new WebhookDeliveryError('El webhook excedió el tiempo máximo de espera.', true);
      }
      throw new WebhookDeliveryError(
        error instanceof Error ? error.message : 'Fallo de red al publicar el webhook.',
        true,
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  private assertValidUrl(url: string): void {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new Error(`URL de webhook inválida: ${url}`);
    }
    if (parsed.username.length > 0 || parsed.password.length > 0) {
      throw new Error(`La URL del webhook no puede contener credenciales: ${url}`);
    }
    if (parsed.protocol !== 'https:' && !(this.allowHttp && parsed.protocol === 'http:')) {
      throw new Error(`El endpoint de webhook debe usar HTTPS: ${url}`);
    }
  }
}
