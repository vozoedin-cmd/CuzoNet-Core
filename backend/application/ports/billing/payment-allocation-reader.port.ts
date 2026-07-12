export interface PaymentAllocationReader {
  allocatedToInvoice(companyId: string, invoiceId: string): Promise<number>;
}
