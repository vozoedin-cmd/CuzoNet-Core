import type {
  ProvisioningActionAdapter,
  ProvisioningActionInput,
  ProvisioningActionResult,
} from '../../../application/ports/provisioning/provisioning-action-adapter.port.js';

export class DisabledRouterOsProvisioningAdapter implements ProvisioningActionAdapter {
  public readonly type = 'routeros_operation';

  public async execute(_input: ProvisioningActionInput): Promise<ProvisioningActionResult> {
    return {
      errorCode: 'PROVISIONING_ADAPTER_DISABLED',
      errorMessage: 'La integración con RouterOS para aprovisionamiento no está habilitada o implementada.',
      outcome: 'permanentFailure',
    };
  }
}
