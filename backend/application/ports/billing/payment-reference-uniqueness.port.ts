import type { PaymentMethod } from '../../../domain/billing/payments/value-objects/payment-method.js';
export interface PaymentReferenceUniquenessPort {
  existsExternalReference(
    companyId: string,
    method: PaymentMethod,
    reference: string,
  ): Promise<boolean>;
}
