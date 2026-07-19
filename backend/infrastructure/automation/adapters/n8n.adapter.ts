import type { AutomationActionAdapter, AutomationActionInput, AutomationActionResult } from '../../../application/ports/automation/automation-action-adapter.port.js';
import { TemplateRenderer } from '../../../domain/automation/services/template-renderer.js';

export class N8nAutomationActionAdapter implements AutomationActionAdapter {
  public readonly type = 'n8n_webhook';
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
    if (!input.workflowKey) {
      return { errorCode: 'MISSING_WORKFLOW_KEY', outcome: 'permanent_failure', safeMessage: 'No workflow key provided' };
    }

    // Lookup N8N base URL from config
    const baseUrl = process.env[`N8N_URL_${configurationReference}`];
    
    if (!baseUrl) {
      return { errorCode: 'CONFIGURATION_NOT_FOUND', outcome: 'permanent_failure', safeMessage: 'N8N URL not configured' };
    }

    if (!this.allowHttp && baseUrl.startsWith('http://')) {
      return { errorCode: 'INSECURE_URL', outcome: 'permanent_failure', safeMessage: 'HTTP is not allowed for N8N' };
    }

    try {
      const urlObj = new URL(baseUrl);
      if (['localhost', '127.0.0.1', '0.0.0.0', '169.254.169.254'].includes(urlObj.hostname)) {
        return { errorCode: 'SSRF_PROTECTION', outcome: 'permanent_failure', safeMessage: 'Internal hostnames are blocked' };
      }
    } catch {
      return { errorCode: 'INVALID_URL', outcome: 'permanent_failure', safeMessage: 'The configured URL is invalid' };
    }

    // Safely construct the URL (only workflowKey is appended)
    const url = new URL(`/webhook/${encodeURIComponent(input.workflowKey)}`, baseUrl).toString();

    let payload: unknown = {};
    if (input.payloadTemplate) {
      try {
        payload = this.renderer.render(input.payloadTemplate, { event: JSON.parse(input.eventId) /* Simplified */ });
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
