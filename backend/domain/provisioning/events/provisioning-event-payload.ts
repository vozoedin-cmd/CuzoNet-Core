/**
 * Shared payload shape for every ProvisioningRequest lifecycle event
 * (Requested/Succeeded/Failed/RetryScheduled). Never carries secrets:
 * no password, credentialReference, token, secretReference or routerSecret.
 */
export interface ProvisioningEventPayload {
  readonly action: string;
  readonly actionType: string;
  readonly attemptNumber: number;
  readonly companyId: string;
  readonly errorCode?: string;
  readonly failureType?: 'permanent' | 'temporary';
  readonly occurredAt: string;
  readonly requestId: string;
  readonly resourceType: string;
  readonly routerId?: string;
}
