import { InvalidBillingDataError } from '../errors/invalid-billing-data.error.js';
import type { Money } from '../shared/money.js';
import type { BillingPeriod } from './value-objects/billing-period.js';
import type { InvoiceDescription } from './value-objects/invoice-description.js';
import type { InvoiceLineId } from './value-objects/invoice-line-id.js';
import type { InvoiceLineType } from './value-objects/invoice-line-type.js';

export interface InvoiceLineProps {
  amount: Money;
  description: InvoiceDescription;
  id: InvoiceLineId;
  period: BillingPeriod | undefined;
  type: InvoiceLineType;
}
export class InvoiceLine {
  private constructor(private readonly props: InvoiceLineProps) {}
  public static create(props: InvoiceLineProps): InvoiceLine {
    if (props.amount.cents === 0)
      throw new InvalidBillingDataError('amountCents', 'Una línea no puede ser cero.');
    if (props.type === 'charge' && props.amount.cents < 0)
      throw new InvalidBillingDataError('amountCents', 'Un cargo debe ser positivo.');
    if (props.type === 'discount' && props.amount.cents > 0)
      throw new InvalidBillingDataError('amountCents', 'Un descuento debe ser negativo.');
    return new InvoiceLine(props);
  }
  public get id(): InvoiceLineId {
    return this.props.id;
  }
  public get type(): InvoiceLineType {
    return this.props.type;
  }
  public get description(): InvoiceDescription {
    return this.props.description;
  }
  public get amount(): Money {
    return this.props.amount;
  }
  public get period(): BillingPeriod | undefined {
    return this.props.period;
  }
}
