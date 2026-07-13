export type AutomationEventReceiptStatus = 'processing' | 'processed' | 'failed';
export interface AutomationEventReceiptPort {
  getStatus(companyId: string, eventId: string): Promise<AutomationEventReceiptStatus | null>;
  mark(companyId: string, eventId: string, status: AutomationEventReceiptStatus): Promise<void>;
}
