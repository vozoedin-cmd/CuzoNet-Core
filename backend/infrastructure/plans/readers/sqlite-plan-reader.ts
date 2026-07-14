import type { PlanDto } from '../../../application/dto/plans/plan.dto.js';
import type { PlanReader } from '../../../application/ports/plans/plan-reader.port.js';
import type {
  ResolvedProvisioningProfile,
  ResolvedProvisioningProfileReader,
} from '../../../application/ports/plans/resolved-provisioning-profile-reader.port.js';
import type { SqliteDatabaseSession } from '../../database/sqlite/sqlite-database-session.js';

export class SqlitePlanReader implements PlanReader, ResolvedProvisioningProfileReader {
  public constructor(private readonly session: SqliteDatabaseSession) {}

  public listActive(companyId: string): Promise<readonly PlanDto[]> {
    return this.session.execute(async (database) => {
      const plans = await database
        .selectFrom('plans')
        .selectAll()
        .where('company_id', '=', companyId)
        .where('is_active', '=', 1)
        .orderBy('code', 'asc')
        .execute();
      return Promise.all(
        plans.map(async (plan) => {
          const version = await database
            .selectFrom('plan_versions')
            .selectAll()
            .where('plan_id', '=', plan.id)
            .orderBy('version_number', 'desc')
            .executeTakeFirstOrThrow();
          return {
            code: plan.code,
            currentVersion: {
              downloadKbps: version.download_kbps,
              id: version.id,
              priceCents: version.price_cents,
              uploadKbps: version.upload_kbps,
              version: version.version_number,
            },
            id: plan.id,
            isActive: true,
            name: plan.name,
            serviceType: plan.service_type,
          };
        }),
      );
    });
  }

  public findByPlanVersionId(
    companyId: string,
    planVersionId: string,
  ): Promise<ResolvedProvisioningProfile | null> {
    return this.session.execute(async (database) => {
      const row = await database
        .selectFrom('plan_versions')
        .innerJoin('plans', 'plans.id', 'plan_versions.plan_id')
        .select([
          'plan_versions.id as planVersionId',
          'plan_versions.download_kbps as downloadKbps',
          'plan_versions.upload_kbps as uploadKbps',
          'plans.service_type as serviceType',
        ])
        .where('plans.company_id', '=', companyId)
        .where('plan_versions.id', '=', planVersionId)
        .executeTakeFirst();
      if (row === undefined || row.serviceType !== 'simple_queue') return null;
      return row;
    });
  }
}
