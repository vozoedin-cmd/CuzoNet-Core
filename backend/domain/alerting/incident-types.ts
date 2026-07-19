export const alertSeverities = ['info', 'warning', 'minor', 'major', 'critical'] as const;
export type AlertSeverity = (typeof alertSeverities)[number];

export const incidentStatuses = ['open', 'acknowledged', 'resolved'] as const;
export type IncidentStatus = (typeof incidentStatuses)[number];

export const incidentEventTypes = [
  'opened',
  'condition_reconfirmed',
  'acknowledged',
  'resolved',
  'reopened',
] as const;
export type IncidentEventType = (typeof incidentEventTypes)[number];

export type AlertCondition =
  | {
      readonly expectedStatus: 'DOWN';
      readonly operator: 'equals';
      readonly type: 'equipment_status';
    }
  | {
      readonly metricType: string;
      readonly operator: 'greater_than';
      readonly threshold: number;
      readonly type: 'metric_threshold';
    };
