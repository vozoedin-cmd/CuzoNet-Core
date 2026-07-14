
export interface AlertEventPublisher {
  publishAlertTriggered(companyId: string, alertId: string, entityId: string): Promise<void>;
  publishAlertResolved(companyId: string, alertId: string, entityId: string): Promise<void>;
}
