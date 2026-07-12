import type { Payment } from '../../../domain/billing/payments/payment.js';
export interface PaymentListCriteria {
  clientId?: string;
  companyId: string;
  from?: Date;
  page: number;
  pageSize: number;
  to?: Date;
}
export interface PaymentPage {
  payments: readonly Payment[];
  total: number;
}
export interface PaymentReader {
  findById(companyId: string, paymentId: string): Promise<Payment | null>;
  list(criteria: PaymentListCriteria): Promise<PaymentPage>;
  listAllByClient(companyId: string, clientId: string): Promise<readonly Payment[]>;
}
