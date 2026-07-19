import type { AlertRule } from '../../../domain/alerting/alert-rule.js';
import type { IncidentEvent } from '../../../domain/alerting/incident-event.js';
import type { AlertSeverity, IncidentStatus } from '../../../domain/alerting/incident-types.js';
import type { Incident } from '../../../domain/alerting/incident.js';

export interface IncidentListFilters {
  readonly equipmentId?: string;
  readonly ruleId?: string;
  readonly severity?: AlertSeverity;
  readonly status?: IncidentStatus;
}

export interface AlertRuleRepository {
  findActiveByCompany(companyId: string): Promise<AlertRule[]>;
  findByCode(companyId: string, code: string): Promise<AlertRule | null>;
  findRuleById(companyId: string, id: string): Promise<AlertRule | null>;
  listByCompany(companyId: string): Promise<AlertRule[]>;
  save(rule: AlertRule): Promise<void>;
}

export interface IncidentRepository {
  findActiveByCorrelationKey(companyId: string, correlationKey: string): Promise<Incident | null>;
  findById(companyId: string, id: string): Promise<Incident | null>;
  list(companyId: string, filters?: IncidentListFilters): Promise<Incident[]>;
  save(incident: Incident): Promise<void>;
}

export interface IncidentEventRepository {
  append(events: readonly IncidentEvent[]): Promise<void>;
  listByIncident(companyId: string, incidentId: string): Promise<IncidentEvent[]>;
}
