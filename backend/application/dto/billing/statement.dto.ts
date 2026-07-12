export type StatementEntryType = 'invoice' | 'payment' | 'reversal';
export interface StatementEntryDto {
  amountCents: number;
  occurredAt: string;
  referenceId: string;
  type: StatementEntryType;
}
export interface AccountStatementDto {
  accountId: string;
  closingCreditCents: number;
  closingDebtCents: number;
  currencyCode: string;
  entries: readonly StatementEntryDto[];
  from: string;
  to: string;
}
