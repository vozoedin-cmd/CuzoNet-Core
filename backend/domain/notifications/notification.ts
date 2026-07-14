
import type { NotificationChannel, NotificationStatus, DeliveryStatus, RecipientAddress, TemplateVariables, DeliveryError } from './types.js';

export interface DeliveryAttemptProps {
  id: string;
  occurredAt: Date;
  error?: DeliveryError | undefined;
}

export interface NotificationDeliveryProps {
  id: string;
  recipient: RecipientAddress;
  channel: NotificationChannel;
  status: DeliveryStatus;
  nextAttemptAt?: Date | undefined;
  attemptCount: number;
  claimToken?: string | undefined;
  claimExpiresAt?: Date | undefined;
  attempts: DeliveryAttemptProps[];
}

export interface NotificationProps {
  id: string;
  companyId: string;
  templateId: string;
  templateVersionId: string;
  variables: TemplateVariables;
  status: NotificationStatus;
  deliveries: NotificationDeliveryProps[];
  idempotencyKey?: string | undefined;
  createdAt: Date;
}

export class Notification {
  private constructor(public readonly props: NotificationProps) {}

  public static create(
    props: Omit<NotificationProps, 'status' | 'deliveries' | 'createdAt'> & { 
      destinations: { recipient: RecipientAddress, channel: NotificationChannel }[], 
      deliveryIdGenerator: () => string 
    }
  ): Notification {
    if (props.destinations.length === 0) {
      throw new Error('Notification must have at least one recipient destination');
    }

    const deliveries: NotificationDeliveryProps[] = props.destinations.map(d => ({
      id: props.deliveryIdGenerator(),
      recipient: d.recipient,
      channel: d.channel,
      status: 'pending',
      attemptCount: 0,
      attempts: []
    }));

    return new Notification({
      id: props.id,
      companyId: props.companyId,
      templateId: props.templateId,
      templateVersionId: props.templateVersionId,
      variables: props.variables,
      idempotencyKey: props.idempotencyKey,
      status: 'queued',
      deliveries,
      createdAt: new Date()
    });
  }

  public static reconstitute(props: NotificationProps): Notification {
    return new Notification(props);
  }

  public cancel(): void {
    if (this.props.status === 'delivered' || this.props.status === 'cancelled') {
      return;
    }
    this.props.status = 'cancelled';
    for (const d of this.props.deliveries) {
      if (d.status === 'pending' || d.status === 'claimed' || d.status === 'failed') {
        d.status = 'cancelled';
      }
    }
  }

  public claimDelivery(deliveryId: string, token: string, ttlSeconds: number): void {
    const d = this.props.deliveries.find(d => d.id === deliveryId);
    if (!d) throw new Error('Delivery not found');
    if (d.status !== 'pending') throw new Error('Delivery is not pending');

    d.status = 'claimed';
    d.claimToken = token;
    const expires = new Date();
    expires.setSeconds(expires.getSeconds() + ttlSeconds);
    d.claimExpiresAt = expires;

    this.recalculateStatus();
  }

  public completeDelivery(deliveryId: string): void {
    const d = this.props.deliveries.find(d => d.id === deliveryId);
    if (!d) throw new Error('Delivery not found');
    if (d.status !== 'claimed') throw new Error('Delivery must be claimed to be completed');

    d.status = 'sent';
    d.claimToken = undefined;
    d.claimExpiresAt = undefined;
    
    this.recalculateStatus();
  }

  public failDelivery(deliveryId: string, attemptId: string, error: DeliveryError, retryDelaySeconds?: number): void {
    const d = this.props.deliveries.find(d => d.id === deliveryId);
    if (!d) throw new Error('Delivery not found');
    
    d.attemptCount++;
    d.attempts.push({
      id: attemptId,
      occurredAt: new Date(),
      error
    });

    d.claimToken = undefined;
    d.claimExpiresAt = undefined;

    if (retryDelaySeconds !== undefined && d.attemptCount < 3) {
      d.status = 'pending'; // Schedule for retry
      const next = new Date();
      next.setSeconds(next.getSeconds() + retryDelaySeconds);
      d.nextAttemptAt = next;
    } else {
      d.status = d.attemptCount >= 3 ? 'manual_review' : 'failed';
    }

    this.recalculateStatus();
  }

  private recalculateStatus(): void {
    const allSent = this.props.deliveries.every(d => d.status === 'sent');
    const anySent = this.props.deliveries.some(d => d.status === 'sent');
    const allFailed = this.props.deliveries.every(d => d.status === 'failed' || d.status === 'manual_review');
    const anyClaimed = this.props.deliveries.some(d => d.status === 'claimed');

    if (allSent) {
      this.props.status = 'delivered';
    } else if (allFailed) {
      this.props.status = 'failed';
    } else if (anySent) {
      this.props.status = 'partially_delivered';
    } else if (anyClaimed) {
      this.props.status = 'processing';
    } else {
      this.props.status = 'queued';
    }
  }
}
