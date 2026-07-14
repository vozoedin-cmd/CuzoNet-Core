import type { CompatibleServiceTypeValue } from '../../../domain/plans/value-objects/compatible-service-type.js';

export interface ResolvedProvisioningProfile {
  downloadKbps: number;
  planVersionId: string;
  serviceType: CompatibleServiceTypeValue;
  uploadKbps: number;
}

export interface ResolvedProvisioningProfileReader {
  findByPlanVersionId(
    companyId: string,
    planVersionId: string,
  ): Promise<ResolvedProvisioningProfile | null>;
}
