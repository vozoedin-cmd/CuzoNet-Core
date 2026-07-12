import type { PaymentMethod } from '../../../domain/billing/payments/value-objects/payment-method.js';
import type { PaymentStatus } from '../../../domain/billing/payments/value-objects/payment-status.js';
import type { Payment } from '../../../domain/billing/payments/payment.js';
export interface PaymentAllocationInputDto {
  amountCents: number;
  invoiceId: string;
}
export interface RecordPaymentInput {
  allocations?: readonly PaymentAllocationInputDto[];
  amountCents: number;
  causationId: string;
  clientId: string;
  correlationId: string;
  currencyCode: string;
  externalReference?: string;
  idempotencyKey: string;
  method: PaymentMethod;
  receivedAt: string;
}
export interface ListPaymentsInput {
  clientId?: string;
  from?: string;
  page: number;
  pageSize: number;
  to?: string;
}
export interface PaymentDto {
  allocations: readonly PaymentAllocationInputDto[];
  amountCents: number;
  clientId: string;
  currencyCode: string;
  id: string;
  method: PaymentMethod;
  receivedAt: string;
  status: PaymentStatus;
}
export interface PaymentPageDto {
  data: readonly PaymentDto[];
  page: number;
  pageSize: number;
  total: number;
}
export function toPaymentDto(payment: Payment): PaymentDto {
  return {
    allocations: payment.allocations.map((allocation) => ({
      amountCents: allocation.amount.cents,
      invoiceId: allocation.invoiceId.value,
    })),
    amountCents: payment.amount.cents,
    clientId: payment.clientId,
    currencyCode: payment.amount.currency.value,
    id: payment.id.value,
    method: payment.method,
    receivedAt: payment.receivedAt.toISOString(),
    status: payment.status,
  };
}
