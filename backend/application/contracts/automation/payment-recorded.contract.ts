export interface PaymentRecordedPayload {
  billingAccountId: string | null;
  clientId: string;
  companyId: string;
  paymentId: string;
}
