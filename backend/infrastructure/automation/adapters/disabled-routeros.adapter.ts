import type { AutomationActionAdapter, AutomationActionInput, AutomationActionResult } from '../../../application/ports/automation/automation-action-adapter.port.js';

export class DisabledRouterOsAutomationActionAdapter implements AutomationActionAdapter {
  public readonly type = 'routeros_operation';

  public async execute(
    _configurationReference: string | undefined,
    _input: AutomationActionInput,
  ): Promise<AutomationActionResult> {
    return {
      errorCode: 'ROUTEROS_AUTOMATION_NOT_CONFIGURED',
      outcome: 'permanent_failure',
      safeMessage: 'La integración con RouterOS para automatizaciones no está habilitada o implementada.',
    };
  }
}
