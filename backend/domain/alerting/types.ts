
export type AlertSeverity = 'CRITICAL' | 'WARNING' | 'INFO';
export type AlertStatus = 'TRIGGERED' | 'ACKNOWLEDGED' | 'RESOLVED' | 'SILENCED';
export type AlertCategory = 'NETWORK' | 'BILLING' | 'SYSTEM';
export type EntityType = 'equipment' | 'invoice' | 'node';

export interface AlertCondition {
  metric: string;
  operator: '>' | '<' | '==' | '!=' | 'DOWN' | 'OVERDUE';
  threshold?: number;
  durationSec?: number;
}
