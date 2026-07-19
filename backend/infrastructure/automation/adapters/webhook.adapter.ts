import type { AutomationActionAdapter, AutomationActionInput, AutomationActionResult } from '../../../application/ports/automation/automation-action-adapter.port.js';
import { TemplateRenderer } from '../../../domain/automation/services/template-renderer.js';

export class WebhookAutomationActionAdapter implements AutomationActionAdapter {
  public readonly type = 'webhook';
  private readonly renderer = new TemplateRenderer();

  public constructor(
    private readonly allowHttp: boolean = false,
  ) {}

  public async execute(
    configurationReference: string | undefined,
    input: AutomationActionInput,
  ): Promise<AutomationActionResult> {
    if (!configurationReference) {
      return { errorCode: 'MISSING_CONFIGURATION', outcome: 'permanent_failure', safeMessage: 'No configuration reference provided' };
    }

    // In a real environment, we'd lookup the configuration reference (URL, secret, etc) from a secure vault.
    // For this implementation, we simulate fetching the config.
    const url = process.env[`WEBHOOK_URL_${configurationReference}`];
    
    if (!url) {
      return { errorCode: 'CONFIGURATION_NOT_FOUND', outcome: 'permanent_failure', safeMessage: 'Webhook URL not configured' };
    }

    if (!this.allowHttp && url.startsWith('http://')) {
      return { errorCode: 'INSECURE_URL', outcome: 'permanent_failure', safeMessage: 'HTTP is not allowed for webhooks' };
    }

    try {
      const urlObj = new URL(url);
      if (['localhost', '127.0.0.1', '0.0.0.0', '169.254.169.254'].includes(urlObj.hostname)) {
        return { errorCode: 'SSRF_PROTECTION', outcome: 'permanent_failure', safeMessage: 'Internal hostnames are blocked' };
      }
    } catch {
      return { errorCode: 'INVALID_URL', outcome: 'permanent_failure', safeMessage: 'The configured URL is invalid' };
    }

    let payload: unknown = {};
    if (input.payloadTemplate) {
      try {
        payload = this.renderer.render(input.payloadTemplate, { event: JSON.parse(input.eventId) /* This is a simplification */ });
      } catch (error: unknown) {
        return { errorCode: 'TEMPLATE_ERROR', outcome: 'permanent_failure', safeMessage: error instanceof Error ? error.message : 'Unknown template error' };
      }
    }

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        return { outcome: 'success', responseCode: response.status };
      }

      if (response.status >= 500 || response.status === 429) {
        return { errorCode: 'UPSTREAM_ERROR', outcome: 'retryable_failure', responseCode: response.status, safeMessage: `Upstream error ${response.status}` };
      }

      return { errorCode: 'CLIENT_ERROR', outcome: 'permanent_failure', responseCode: response.status, safeMessage: `Client error ${response.status}` };
    } catch (error: unknown) {
      return { errorCode: 'NETWORK_ERROR', outcome: 'retryable_failure', safeMessage: error instanceof Error ? error.message : 'Unknown network error' };
    }
  }
}
