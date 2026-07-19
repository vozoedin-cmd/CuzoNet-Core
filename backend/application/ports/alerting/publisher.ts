/** @legacy Modelo Alert/AlertPolicy de la migración 0014; no usar en Incident Alerting. */

export interface AlertEventPublisher {
  publishAlertTriggered(companyId: string, alertId: string, entityId: string): Promise<void>;
  publishAlertResolved(companyId: string, alertId: string, entityId: string): Promise<void>;
}
