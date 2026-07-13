export interface ProvisioningAutomationFacts {
  attemptCount: number;
  errorCode: string;
  operationId: string;
  operationStatus: string;
  serviceId: string;
}
export interface ProvisioningAutomationReader {
  findFailureFacts(
    companyId: string,
    operationId: string,
    errorCode: string,
    attemptCount: number,
    serviceId: string,
  ): Promise<ProvisioningAutomationFacts>;
}
