import type { AutomationActionType } from '../../../domain/automation/value-objects/action-definition.js';

export interface AutomationActionInput {
  companyId: string;
  contextId: string;
  equipmentId?: string;
  eventId: string;
  executionId: string;
  operationType?: string;
  parameters?: Record<string, unknown>;
  payloadTemplate?: unknown;
  ruleId: string;
  ruleVersion: number;
  workflowKey?: string;
}

export type AutomationActionResult =
  | {
      outcome: 'success';
      metadata?: unknown;
      providerExecutionId?: string;
      responseCode?: number;
    }
  | {
      errorCode: string;
      outcome: 'retryable_failure';
      responseCode?: number;
      retryAfterSeconds?: number;
      safeMessage: string;
    }
  | {
      errorCode: string;
      outcome: 'permanent_failure';
      responseCode?: number;
      safeMessage: string;
    };

export interface AutomationActionAdapter {
  readonly type: AutomationActionType;

  execute(
    configurationReference: string | undefined,
    input: AutomationActionInput,
  ): Promise<AutomationActionResult>;
}
