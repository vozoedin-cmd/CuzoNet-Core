export type AutomationExecutionStatus =
  'evaluated_no_match' | 'action_pending' | 'action_requested' | 'action_rejected' | 'failed';
export interface AutomationActionResultDto {
  actionRequestKey: string;
  actionType: 'request_service_reactivation';
  actionVersion: 1;
  requestId?: string;
  status: 'pending' | 'accepted' | 'rejected' | 'unavailable';
}
export interface AutomationExecutionDto {
  actionResults: readonly AutomationActionResultDto[];
  completedAt?: string;
  contextId: string;
  errorCode?: string;
  errorMessage?: string;
  eventId: string;
  id: string;
  matched: boolean;
  ruleId: string;
  ruleVersion: number;
  startedAt: string;
  status: AutomationExecutionStatus;
}
