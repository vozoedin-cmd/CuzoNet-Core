import type { Plan } from '../../../domain/plans/plan.js';
import type { CompatibleServiceTypeValue } from '../../../domain/plans/value-objects/compatible-service-type.js';

export interface CreatePlanInput {
  causationId: string;
  code: string;
  correlationId: string;
  downloadKbps: number;
  name: string;
  priceCents: number;
  serviceType: CompatibleServiceTypeValue;
  uploadKbps: number;
}

export interface RevisePlanInput {
  causationId: string;
  correlationId: string;
  downloadKbps: number;
  effectiveFrom: string;
  isActive?: boolean | undefined;
  planId: string;
  priceCents: number;
  uploadKbps: number;
}

export interface PlanVersionDto {
  downloadKbps: number;
  id: string;
  priceCents: number;
  uploadKbps: number;
  version: number;
}

export interface PlanDto {
  code: string;
  currentVersion: PlanVersionDto;
  id: string;
  isActive: boolean;
  name: string;
  serviceType: CompatibleServiceTypeValue;
}

export interface PlanMutationResult {
  domainEvents: ReturnType<Plan['pullDomainEvents']>;
  plan: PlanDto;
}

export function toPlanDto(plan: Plan): PlanDto {
  const version = plan.currentVersion;
  return {
    code: plan.code.value,
    currentVersion: {
      downloadKbps: version.bandwidth.downloadKbps,
      id: version.id.value,
      priceCents: version.priceCents,
      uploadKbps: version.bandwidth.uploadKbps,
      version: version.versionNumber,
    },
    id: plan.id.value,
    isActive: plan.isActive,
    name: plan.name.value,
    serviceType: plan.serviceType.value,
  };
}
