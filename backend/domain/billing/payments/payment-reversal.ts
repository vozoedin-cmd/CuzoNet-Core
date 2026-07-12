import type { ReversalReason } from './value-objects/reversal-reason.js';
export interface PaymentReversalProps {
  reason: ReversalReason;
  reversedAt: Date;
  reversedBy: string;
}
export class PaymentReversal {
  private constructor(private readonly props: PaymentReversalProps) {}
  public static create(props: PaymentReversalProps): PaymentReversal {
    return new PaymentReversal(props);
  }
  public get reason(): ReversalReason {
    return this.props.reason;
  }
  public get reversedAt(): Date {
    return new Date(this.props.reversedAt);
  }
  public get reversedBy(): string {
    return this.props.reversedBy;
  }
}
