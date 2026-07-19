/** @legacy Modelo Alert/AlertPolicy de la migración 0014; no usar en Incident Alerting. */

import type { AlertPolicy } from '../../../domain/alerting/alert-policy.js';
import type { Alert } from '../../../domain/alerting/alert.js';

export interface AlertPolicyRepository {
  save(policy: AlertPolicy): Promise<void>;
  findAllActive(companyId: string): Promise<AlertPolicy[]>;
}

export interface AlertRepository {
  save(alert: Alert): Promise<void>;
  findById(id: string): Promise<Alert | null>;
  findActiveAlerts(companyId: string): Promise<Alert[]>;
  findByEntityAndPolicy(entityId: string, policyId: string, activeOnly: boolean): Promise<Alert | null>;
}
