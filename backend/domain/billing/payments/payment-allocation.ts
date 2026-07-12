import type { InvoiceId } from '../invoices/value-objects/invoice-id.js';
import type { AllocatedMoney } from './value-objects/allocated-money.js';
import type { PaymentAllocationId } from './value-objects/payment-allocation-id.js';

export interface PaymentAllocationProps {
  allocatedAt: Date;
  amount: AllocatedMoney;
  billingAccountId: string;
  id: PaymentAllocationId;
  invoiceId: InvoiceId;
}
export class PaymentAllocation {
  private constructor(private readonly props: PaymentAllocationProps) {}
  public static create(props: PaymentAllocationProps): PaymentAllocation {
    return new PaymentAllocation(props);
  }
  public get id(): PaymentAllocationId {
    return this.props.id;
  }
  public get invoiceId(): InvoiceId {
    return this.props.invoiceId;
  }
  public get billingAccountId(): string {
    return this.props.billingAccountId;
  }
  public get amount(): AllocatedMoney {
    return this.props.amount;
  }
  public get allocatedAt(): Date {
    return new Date(this.props.allocatedAt);
  }
}
