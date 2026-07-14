import { InvalidPlanDataError } from './errors/invalid-plan-data.error.js';
import type { BandwidthProfile } from './value-objects/bandwidth-profile.js';
import type { PlanVersionId } from './value-objects/plan-version-id.js';

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export interface PlanVersionProps {
  bandwidth: BandwidthProfile;
  createdAt: Date;
  effectiveFrom: string;
  id: PlanVersionId;
  priceCents: number;
  versionNumber: number;
}

export class PlanVersion {
  private constructor(private readonly props: PlanVersionProps) {}

  public static create(props: PlanVersionProps): PlanVersion {
    if (!Number.isSafeInteger(props.versionNumber) || props.versionNumber < 1) {
      throw new InvalidPlanDataError('versionNumber', 'Debe ser un entero positivo.');
    }
    if (!Number.isSafeInteger(props.priceCents) || props.priceCents < 0) {
      throw new InvalidPlanDataError('priceCents', 'Debe ser un entero mayor o igual a cero.');
    }
    if (!PlanVersion.isIsoDate(props.effectiveFrom)) {
      throw new InvalidPlanDataError('effectiveFrom', 'Debe ser una fecha valida en formato YYYY-MM-DD.');
    }
    return new PlanVersion({ ...props, createdAt: new Date(props.createdAt) });
  }

  private static isIsoDate(value: string): boolean {
    if (!ISO_DATE_PATTERN.test(value)) return false;
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }

  public get id(): PlanVersionId {
    return this.props.id;
  }

  public get versionNumber(): number {
    return this.props.versionNumber;
  }

  public get priceCents(): number {
    return this.props.priceCents;
  }

  public get bandwidth(): BandwidthProfile {
    return this.props.bandwidth;
  }

  public get effectiveFrom(): string {
    return this.props.effectiveFrom;
  }

  public get createdAt(): Date {
    return new Date(this.props.createdAt);
  }
}
