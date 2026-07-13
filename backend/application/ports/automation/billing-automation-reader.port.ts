export interface BillingAutomationContext {
  billingAccountId: string | null;
  creditCents: number;
  currencyCode: string;
  debtCents: number;
  overdueCents: number;
  serviceId: string;
}
export interface BillingAutomationReader {
  contextsForPayment(
    companyId: string,
    clientId: string,
    billingAccountId: string | null,
  ): Promise<readonly BillingAutomationContext[]>;
}
