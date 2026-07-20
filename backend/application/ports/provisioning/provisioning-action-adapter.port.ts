export interface ProvisioningActionTarget {
  id: string;
  type: string;
}

export interface ProvisioningActionInput {
  actionType: string;
  companyId: string;
  configurationReference: string | undefined;
  idempotencyKey: string;
  inputSnapshotJson: string;
  requestId: string;
  target: ProvisioningActionTarget;
}

export type ProvisioningActionResult =
  | {
      metadata?: Record<string, unknown>;
      outcome: 'success';
    }
  | {
      errorCode: string;
      errorMessage: string;
      outcome: 'temporaryFailure';
      retryAfterMs?: number;
    }
  | {
      errorCode: string;
      errorMessage: string;
      outcome: 'permanentFailure';
    };

export interface ProvisioningActionAdapter {
  readonly type: string;
  execute(input: ProvisioningActionInput): Promise<ProvisioningActionResult>;
}
