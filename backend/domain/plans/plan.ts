import { InvalidPlanDataError } from './errors/invalid-plan-data.error.js';
import { PlanVersionCreatedEvent } from './events/plan-version-created.event.js';
import { PlanVersion } from './plan-version.js';
import type { BandwidthProfile } from './value-objects/bandwidth-profile.js';
import type { CompatibleServiceType } from './value-objects/compatible-service-type.js';
import type { PlanCode } from './value-objects/plan-code.js';
import type { PlanId } from './value-objects/plan-id.js';
import type { PlanName } from './value-objects/plan-name.js';
import type { PlanVersionId } from './value-objects/plan-version-id.js';

export interface PlanHydrationProps {
  code: PlanCode;
  companyId: string;
  createdAt: Date;
  id: PlanId;
  isActive: boolean;
  name: PlanName;
  serviceType: CompatibleServiceType;
  updatedAt: Date | undefined;
  versions: readonly PlanVersion[];
}

export interface CreatePlanProps {
  bandwidth: BandwidthProfile;
  causationId: string;
  code: PlanCode;
  companyId: string;
  correlationId: string;
  createdAt: Date;
  effectiveFrom: string;
  eventId: string;
  id: PlanId;
  name: PlanName;
  planVersionId: PlanVersionId;
  priceCents: number;
  serviceType: CompatibleServiceType;
}

export interface RevisePlanProps {
  bandwidth: BandwidthProfile;
  causationId: string;
  correlationId: string;
  effectiveFrom: string;
  eventId: string;
  isActive: boolean | undefined;
  planVersionId: PlanVersionId;
  priceCents: number;
  revisedAt: Date;
}

export class Plan {
  private readonly domainEvents: PlanVersionCreatedEvent[] = [];
  private activeValue: boolean;
  private updatedAtValue: Date | undefined;
  private readonly versionsValue: PlanVersion[];

  private constructor(private readonly props: PlanHydrationProps) {
    if (props.versions.length === 0) {
      throw new InvalidPlanDataError('versions', 'Debe contener al menos una version.');
    }
    const versionNumbers = new Set(props.versions.map((version) => version.versionNumber));
    const versionIds = new Set(props.versions.map((version) => version.id.value));
    if (versionNumbers.size !== props.versions.length || versionIds.size !== props.versions.length) {
      throw new InvalidPlanDataError('versions', 'Las identidades y numeros de version deben ser unicos.');
    }
    this.activeValue = props.isActive;
    this.updatedAtValue = props.updatedAt;
    this.versionsValue = [...props.versions].sort(
      (left, right) => left.versionNumber - right.versionNumber,
    );
  }

  public static create(props: CreatePlanProps): Plan {
    const version = PlanVersion.create({
      bandwidth: props.bandwidth,
      createdAt: props.createdAt,
      effectiveFrom: props.effectiveFrom,
      id: props.planVersionId,
      priceCents: props.priceCents,
      versionNumber: 1,
    });
    const plan = new Plan({
      code: props.code,
      companyId: props.companyId,
      createdAt: props.createdAt,
      id: props.id,
      isActive: true,
      name: props.name,
      serviceType: props.serviceType,
      updatedAt: undefined,
      versions: [version],
    });
    plan.recordVersionCreated(props, version.id.value);
    return plan;
  }

  public static rehydrate(props: PlanHydrationProps): Plan {
    return new Plan(props);
  }

  public revise(props: RevisePlanProps): PlanVersion {
    const current = this.currentVersion;
    if (props.effectiveFrom <= current.effectiveFrom) {
      throw new InvalidPlanDataError(
        'effectiveFrom',
        'Debe ser posterior a la fecha efectiva de la version vigente.',
      );
    }
    const version = PlanVersion.create({
      bandwidth: props.bandwidth,
      createdAt: props.revisedAt,
      effectiveFrom: props.effectiveFrom,
      id: props.planVersionId,
      priceCents: props.priceCents,
      versionNumber: current.versionNumber + 1,
    });
    this.versionsValue.push(version);
    this.activeValue = props.isActive ?? this.activeValue;
    this.updatedAtValue = props.revisedAt;
    this.recordVersionCreated(props, version.id.value);
    return version;
  }

  private recordVersionCreated(
    props: Pick<
      CreatePlanProps | RevisePlanProps,
      'causationId' | 'correlationId' | 'eventId'
    > & { createdAt?: Date; revisedAt?: Date },
    planVersionId: string,
  ): void {
    this.domainEvents.push(
      new PlanVersionCreatedEvent({
        aggregateId: this.id.value,
        causationId: props.causationId,
        companyId: this.companyId,
        correlationId: props.correlationId,
        eventId: props.eventId,
        occurredAt: props.createdAt ?? props.revisedAt ?? new Date(0),
        planVersionId,
      }),
    );
  }

  public pullDomainEvents(): readonly PlanVersionCreatedEvent[] {
    return this.domainEvents.splice(0, this.domainEvents.length);
  }

  public get id(): PlanId { return this.props.id; }
  public get companyId(): string { return this.props.companyId; }
  public get code(): PlanCode { return this.props.code; }
  public get name(): PlanName { return this.props.name; }
  public get serviceType(): CompatibleServiceType { return this.props.serviceType; }
  public get isActive(): boolean { return this.activeValue; }
  public get versions(): readonly PlanVersion[] { return [...this.versionsValue]; }
  public get currentVersion(): PlanVersion { return this.versionsValue[this.versionsValue.length - 1]!; }
  public get createdAt(): Date { return new Date(this.props.createdAt); }
  public get updatedAt(): Date | undefined {
    return this.updatedAtValue === undefined ? undefined : new Date(this.updatedAtValue);
  }
}
