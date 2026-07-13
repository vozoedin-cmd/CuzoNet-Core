export interface EventEvaluationSummaryDto {
  actionsRejected: number;
  actionsRequested: number;
  alreadyProcessed: boolean;
  eventId: string;
  rulesEvaluated: number;
  rulesMatched: number;
}
