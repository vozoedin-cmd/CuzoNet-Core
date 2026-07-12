import type { Payment } from '../../../domain/billing/payments/payment.js';
export interface PaymentRepository {
  save(payment: Payment): Promise<void>;
}
