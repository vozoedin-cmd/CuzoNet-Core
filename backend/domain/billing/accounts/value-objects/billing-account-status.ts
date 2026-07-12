import { InvalidBillingDataError } from '../../errors/invalid-billing-data.error.js';
export const billingAccountStatuses = ['active', 'closed'] as const;
export type BillingAccountStatus = (typeof billingAccountStatuses)[number];
export function createBillingAccountStatus(value: string): BillingAccountStatus {
  if (value !== 'active' && value !== 'closed')
    throw new InvalidBillingDataError('status', 'Estado de cuenta no permitido.');
  return value;
}
