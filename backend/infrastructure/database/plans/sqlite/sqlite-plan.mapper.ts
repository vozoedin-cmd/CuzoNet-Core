import { Plan } from '../../../../domain/plans/plan.js';
import { PlanVersion } from '../../../../domain/plans/plan-version.js';
import { BandwidthProfile } from '../../../../domain/plans/value-objects/bandwidth-profile.js';
import { CompatibleServiceType } from '../../../../domain/plans/value-objects/compatible-service-type.js';
import { PlanCode } from '../../../../domain/plans/value-objects/plan-code.js';
import { PlanId } from '../../../../domain/plans/value-objects/plan-id.js';
import { PlanName } from '../../../../domain/plans/value-objects/plan-name.js';
import { PlanVersionId } from '../../../../domain/plans/value-objects/plan-version-id.js';
import type { PlanTable, PlanVersionTable } from '../../sqlite/database-schema.js';

export const sqlitePlanMapper = {
  toDomain(plan: PlanTable, versions: readonly PlanVersionTable[]): Plan {
    return Plan.rehydrate({
      code: PlanCode.create(plan.code),
      companyId: plan.company_id,
      createdAt: new Date(plan.created_at),
      id: PlanId.create(plan.id),
      isActive: plan.is_active === 1,
      name: PlanName.create(plan.name),
      serviceType: CompatibleServiceType.create(plan.service_type),
      updatedAt: plan.updated_at === null ? undefined : new Date(plan.updated_at),
      versions: versions.map((version) =>
        PlanVersion.create({
          bandwidth: BandwidthProfile.create({
            ...(version.burst_download_kbps === null
              ? {}
              : { burstDownloadKbps: version.burst_download_kbps }),
            ...(version.burst_upload_kbps === null
              ? {}
              : { burstUploadKbps: version.burst_upload_kbps }),
            downloadKbps: version.download_kbps,
            ...(version.priority === null ? {} : { priority: version.priority }),
            uploadKbps: version.upload_kbps,
          }),
          createdAt: new Date(version.created_at),
          effectiveFrom: version.effective_from,
          id: PlanVersionId.create(version.id),
          priceCents: version.price_cents,
          versionNumber: version.version_number,
        }),
      ),
    });
  },
};
