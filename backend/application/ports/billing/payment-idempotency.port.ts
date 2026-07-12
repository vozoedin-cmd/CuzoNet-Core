import type { Payment } from '../../../domain/billing/payments/payment.js';
export interface PaymentIdempotencyPort {
  findByIdempotencyKey(companyId: string, key: string): Promise<Payment | null>;
}
