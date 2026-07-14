
import type { AlertSeverity, AlertStatus, AlertCategory, EntityType, AlertCondition } from '../../../domain/alerting/types.js';

export interface AlertPolicyDto {
  id: string;
  name: string;
  category: AlertCategory;
  severity: AlertSeverity;
  condition: AlertCondition;
  isActive: boolean;
}

export interface AlertDto {
  id: string;
  policyId: string;
  entityId: string;
  entityType: EntityType;
  status: AlertStatus;
  severity: AlertSeverity;
  triggeredAt: Date;
  resolvedAt?: Date;
}
