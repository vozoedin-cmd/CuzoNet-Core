import { ServiceCreatedEvent } from './events/service-created.event.js';
import type { BillingDay } from './value-objects/billing-day.js';
import type { ClientReferenceId } from './value-objects/client-reference-id.js';
import type { PlanVersionId } from './value-objects/plan-version-id.js';
import type { ServiceId } from './value-objects/service-id.js';
import { ServiceLifecycleStatus } from './value-objects/service-lifecycle-status.js';
import type { ServiceType } from './value-objects/service-type.js';

export interface ServiceHydrationProps {
  billingDay: BillingDay;
  clientId: ClientReferenceId;
  companyId: string;
  createdAt: Date;
  id: ServiceId;
  lifecycleStatus: ServiceLifecycleStatus;
  planVersionId: PlanVersionId;
  serviceType: ServiceType;
  startedOn: Date | undefined;
}

export interface CreateServiceProps {
  billingDay: BillingDay;
  causationId: string;
  clientId: ClientReferenceId;
  companyId: string;
  correlationId: string;
  createdAt: Date;
  eventId: string;
  id: ServiceId;
  planVersionId: PlanVersionId;
  serviceType: ServiceType;
}

export class Service {
  private readonly domainEvents: ServiceCreatedEvent[] = [];

  private constructor(private readonly props: ServiceHydrationProps) {}

  public static create(props: CreateServiceProps): Service {
    const service = new Service({
      billingDay: props.billingDay,
      clientId: props.clientId,
      companyId: props.companyId,
      createdAt: props.createdAt,
      id: props.id,
      lifecycleStatus: ServiceLifecycleStatus.pending(),
      planVersionId: props.planVersionId,
      serviceType: props.serviceType,
      startedOn: undefined,
    });

    service.domainEvents.push(
      new ServiceCreatedEvent({
        aggregateId: props.id.value,
        billingDay: props.billingDay.value,
        causationId: props.causationId,
        clientId: props.clientId.value,
        companyId: props.companyId,
        correlationId: props.correlationId,
        eventId: props.eventId,
        occurredAt: props.createdAt,
        planVersionId: props.planVersionId.value,
        serviceType: props.serviceType.value,
      }),
    );

    return service;
  }

  public static rehydrate(props: ServiceHydrationProps): Service {
    return new Service(props);
  }

  public pullDomainEvents(): readonly ServiceCreatedEvent[] {
    return this.domainEvents.splice(0, this.domainEvents.length);
  }

  public get id(): ServiceId {
    return this.props.id;
  }

  public get companyId(): string {
    return this.props.companyId;
  }

  public get clientId(): ClientReferenceId {
    return this.props.clientId;
  }

  public get planVersionId(): PlanVersionId {
    return this.props.planVersionId;
  }

  public get serviceType(): ServiceType {
    return this.props.serviceType;
  }

  public get billingDay(): BillingDay {
    return this.props.billingDay;
  }

  public get lifecycleStatus(): ServiceLifecycleStatus {
    return this.props.lifecycleStatus;
  }

  public get createdAt(): Date {
    return new Date(this.props.createdAt);
  }

  public get startedOn(): Date | undefined {
    return this.props.startedOn === undefined ? undefined : new Date(this.props.startedOn);
  }
}
