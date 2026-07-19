import type { AutomationActionAdapter, AutomationActionInput, AutomationActionResult } from '../../../application/ports/automation/automation-action-adapter.port.js';

export class DisabledLegacyServiceReactivationActionAdapter implements AutomationActionAdapter {
  public readonly type = 'request_service_reactivation';

  public async execute(
    _configurationReference: string | undefined,
    _input: AutomationActionInput,
  ): Promise<AutomationActionResult> {
    return {
      errorCode: 'LEGACY_REACTIVATION_NOT_ASYNC_SAFE',
      outcome: 'permanent_failure',
      safeMessage: 'La acción de reactivación de servicio legado no cumple garantías idempotentes.',
    };
  }
}
