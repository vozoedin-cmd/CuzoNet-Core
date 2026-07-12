import { BillingConflictError } from '../errors/billing-conflict.error.js';
import type { CurrencyCode } from '../shared/currency-code.js';
import type { BillingAccountId } from './value-objects/billing-account-id.js';
import type { ClientBillingReferenceId } from './value-objects/client-billing-reference-id.js';
import type { BillingAccountStatus } from './value-objects/billing-account-status.js';
import type { ServiceBillingReferenceId } from './value-objects/service-billing-reference-id.js';

export interface BillingAccountProps {
  clientId: ClientBillingReferenceId;
  closedAt: Date | undefined;
  companyId: string;
  currency: CurrencyCode;
  id: BillingAccountId;
  openedAt: Date;
  serviceId: ServiceBillingReferenceId;
  status: BillingAccountStatus;
}
export class BillingAccount {
  private constructor(private readonly props: BillingAccountProps) {}
  public static open(props: Omit<BillingAccountProps, 'closedAt' | 'status'>): BillingAccount {
    return new BillingAccount({ ...props, closedAt: undefined, status: 'active' });
  }
  public static rehydrate(props: BillingAccountProps): BillingAccount {
    return new BillingAccount(props);
  }
  public close(at: Date): void {
    if (this.props.status === 'closed') return;
    if (at < this.props.openedAt)
      throw new BillingConflictError('La fecha de cierre no puede ser anterior a la apertura.');
    this.props.status = 'closed';
    this.props.closedAt = at;
  }
  public get id(): BillingAccountId {
    return this.props.id;
  }
  public get companyId(): string {
    return this.props.companyId;
  }
  public get clientId(): string {
    return this.props.clientId.value;
  }
  public get serviceId(): ServiceBillingReferenceId {
    return this.props.serviceId;
  }
  public get currency(): CurrencyCode {
    return this.props.currency;
  }
  public get status(): BillingAccountStatus {
    return this.props.status;
  }
  public get openedAt(): Date {
    return new Date(this.props.openedAt);
  }
  public get closedAt(): Date | undefined {
    return this.props.closedAt === undefined ? undefined : new Date(this.props.closedAt);
  }
}
