export interface BillingAccountDto {
  clientId: string;
  closedAt?: string;
  currencyCode: string;
  id: string;
  openedAt: string;
  serviceId: string;
  status: 'active' | 'closed';
}
export interface AccountSummaryDto {
  clientId: string;
  creditCents: number;
  currencyCode: string;
  debtCents: number;
  invoiceCount: number;
  nextDueOn: string | null;
  overdueCents: number;
}
