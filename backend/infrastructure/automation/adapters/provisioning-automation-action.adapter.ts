import type { AutomationActionAdapter, AutomationActionInput, AutomationActionResult } from '../../../application/ports/automation/automation-action-adapter.port.js';
import type { RequestProvisioning } from '../../../application/use-cases/provisioning/request-provisioning/request-provisioning.use-case.js';
import { ProvisioningEngineError } from '../../../domain/provisioning/errors/provisioning-engine.error.js';

import type { RequestProvisioningInput } from '../../../application/dto/provisioning/provisioning-request.dto.js';

export class ProvisioningAutomationActionAdapter implements AutomationActionAdapter {
  public readonly type = 'routeros_operation';

  public constructor(private readonly requestProvisioning: RequestProvisioning) {}

  public async execute(
    configurationReference: string | undefined,
    input: AutomationActionInput,
  ): Promise<AutomationActionResult> {
    try {
      const reqInput = {
        actionType: 'routeros_operation', // En el futuro puede venir de input.actionType o configurationReference
        idempotencyKey: `automation_${input.executionId}_${this.type}`,
        inputSnapshotJson: JSON.stringify(input.parameters ?? {}),
        sourceExecutionId: input.executionId,
        targetId: input.equipmentId || 'unknown',
        targetType: input.equipmentId ? 'equipment' : 'unknown',
      } as RequestProvisioningInput;
      if (configurationReference !== undefined) reqInput.configurationReference = configurationReference;

      await this.requestProvisioning.execute(reqInput);

      return {
        outcome: 'success',
        metadata: { message: 'Solicitud de aprovisionamiento encolada exitosamente.' },
      };
    } catch (error) {
      if (error instanceof ProvisioningEngineError) {
        return {
          errorCode: error.code,
          outcome: 'permanent_failure',
          safeMessage: error.message,
        };
      }
      return {
        errorCode: 'PROVISIONING_REQUEST_FAILED',
        outcome: 'retryable_failure',
        safeMessage: 'No se pudo encolar la solicitud de aprovisionamiento.',
      };
    }
  }
}
