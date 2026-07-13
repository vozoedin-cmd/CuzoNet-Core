import type {
  ProvisioningAutomationFacts,
  ProvisioningAutomationReader,
} from '../../../application/ports/automation/provisioning-automation-reader.port.js';
import type { ProvisioningOperationReader } from '../../../application/ports/provisioning/provisioning-operation-reader.port.js';
export class ProvisioningAutomationReaderAdapter implements ProvisioningAutomationReader {
  public constructor(private readonly operations: ProvisioningOperationReader) {}
  public async findFailureFacts(
    companyId: string,
    operationId: string,
    errorCode: string,
    attemptCount: number,
    serviceId: string,
  ): Promise<ProvisioningAutomationFacts> {
    const operation = await this.operations.findById(companyId, operationId);
    return {
      attemptCount: operation?.attemptCount ?? attemptCount,
      errorCode,
      operationId,
      operationStatus: operation?.status.value ?? 'failed',
      serviceId,
    };
  }
}
