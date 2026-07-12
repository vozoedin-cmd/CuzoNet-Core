import type { DocumentNumberGenerator } from '../../../application/ports/billing/document-number-generator.port.js';
export class InMemoryDocumentNumberGenerator implements DocumentNumberGenerator {
  private readonly sequences = new Map<string, number>();
  public nextInvoiceNumber(companyId: string): Promise<string> {
    const next = (this.sequences.get(companyId) ?? 0) + 1;
    this.sequences.set(companyId, next);
    return Promise.resolve(`INV-${String(next).padStart(8, '0')}`);
  }
}
