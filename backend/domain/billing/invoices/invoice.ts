import type { BillingAccountId } from '../accounts/value-objects/billing-account-id.js';
import { BillingConflictError } from '../errors/billing-conflict.error.js';
import { InvalidBillingDataError } from '../errors/invalid-billing-data.error.js';
import type { CurrencyCode } from '../shared/currency-code.js';
import type { InvoiceLine } from './invoice-line.js';
import type { CancellationReason } from './value-objects/cancellation-reason.js';
import type { InvoiceDocumentStatus } from './value-objects/invoice-document-status.js';
import type { InvoiceDueDate } from './value-objects/invoice-due-date.js';
import type { InvoiceId } from './value-objects/invoice-id.js';
import type { InvoiceNumber } from './value-objects/invoice-number.js';

export interface InvoiceProps {
  billingAccountId: BillingAccountId;
  cancelledAt: Date | undefined;
  cancellationReason: CancellationReason | undefined;
  clientId: string;
  companyId: string;
  createdAt: Date;
  currency: CurrencyCode;
  documentStatus: InvoiceDocumentStatus;
  dueOn: InvoiceDueDate;
  id: InvoiceId;
  issuedOn: Date;
  lines: readonly InvoiceLine[];
  number: InvoiceNumber;
}
export class Invoice {
  private constructor(private readonly props: InvoiceProps) {
    this.validate();
  }
  public static issue(
    props: Omit<InvoiceProps, 'cancelledAt' | 'cancellationReason' | 'documentStatus'>,
  ): Invoice {
    return new Invoice({
      ...props,
      cancelledAt: undefined,
      cancellationReason: undefined,
      documentStatus: 'issued',
    });
  }
  public static rehydrate(props: InvoiceProps): Invoice {
    return new Invoice(props);
  }
  private validate(): void {
    if (this.props.lines.length === 0)
      throw new InvalidBillingDataError('lines', 'La factura requiere al menos una línea.');
    if (Number.isNaN(this.props.issuedOn.getTime()) || Number.isNaN(this.props.createdAt.getTime()))
      throw new InvalidBillingDataError('dates', 'Las fechas de la factura no son válidas.');
    if (this.totalCents <= 0)
      throw new InvalidBillingDataError('totalCents', 'El total debe ser mayor que cero.');
    if (this.props.lines.some((line) => line.amount.currency.value !== this.props.currency.value))
      throw new InvalidBillingDataError(
        'lines',
        'Todas las líneas deben usar la moneda de la factura.',
      );
  }
  public cancel(at: Date, reason: CancellationReason, allocatedCents: number): void {
    if (allocatedCents > 0)
      throw new BillingConflictError('Una factura con asignaciones no puede cancelarse.');
    if (this.props.documentStatus === 'cancelled') return;
    this.props.documentStatus = 'cancelled';
    this.props.cancelledAt = at;
    this.props.cancellationReason = reason;
  }
  public get totalCents(): number {
    return this.props.lines.reduce((total, line) => total + line.amount.cents, 0);
  }
  public get id(): InvoiceId {
    return this.props.id;
  }
  public get companyId(): string {
    return this.props.companyId;
  }
  public get clientId(): string {
    return this.props.clientId;
  }
  public get billingAccountId(): BillingAccountId {
    return this.props.billingAccountId;
  }
  public get number(): InvoiceNumber {
    return this.props.number;
  }
  public get currency(): CurrencyCode {
    return this.props.currency;
  }
  public get documentStatus(): InvoiceDocumentStatus {
    return this.props.documentStatus;
  }
  public get issuedOn(): Date {
    return new Date(this.props.issuedOn);
  }
  public get dueOn(): Date {
    return new Date(this.props.dueOn.value);
  }
  public get createdAt(): Date {
    return new Date(this.props.createdAt);
  }
  public get cancelledAt(): Date | undefined {
    return this.props.cancelledAt === undefined ? undefined : new Date(this.props.cancelledAt);
  }
  public get cancellationReason(): CancellationReason | undefined {
    return this.props.cancellationReason;
  }
  public get lines(): readonly InvoiceLine[] {
    return [...this.props.lines];
  }
}
