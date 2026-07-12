export interface DocumentNumberGenerator {
  nextInvoiceNumber(companyId: string): Promise<string>;
}
