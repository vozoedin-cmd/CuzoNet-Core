export interface NetworkOperationFailedPayload {
  attemptCount: number;
  companyId: string;
  errorCode: string;
  operationId: string;
  serviceId: string;
}
