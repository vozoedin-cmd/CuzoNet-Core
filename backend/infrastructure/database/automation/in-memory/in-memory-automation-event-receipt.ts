import type {
  AutomationEventReceiptPort,
  AutomationEventReceiptStatus,
} from '../../../../application/ports/automation/automation-event-receipt.port.js';
export class InMemoryAutomationEventReceipt implements AutomationEventReceiptPort {
  private readonly statuses = new Map<string, AutomationEventReceiptStatus>();
  public getStatus(
    companyId: string,
    eventId: string,
  ): Promise<AutomationEventReceiptStatus | null> {
    return Promise.resolve(this.statuses.get(`${companyId}:${eventId}`) ?? null);
  }
  public mark(
    companyId: string,
    eventId: string,
    status: AutomationEventReceiptStatus,
  ): Promise<void> {
    this.statuses.set(`${companyId}:${eventId}`, status);
    return Promise.resolve();
  }
}
