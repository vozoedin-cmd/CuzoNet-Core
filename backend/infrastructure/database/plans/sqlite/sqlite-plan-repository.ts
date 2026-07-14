import type { PlanRepository } from '../../../../application/ports/plans/plan-repository.port.js';
import type { Plan } from '../../../../domain/plans/plan.js';
import { DuplicatePlanCodeError } from '../../../../domain/plans/errors/duplicate-plan-code.error.js';
import type { SqliteDatabaseSession } from '../../sqlite/sqlite-database-session.js';
import { isSqliteConstraintError } from '../../sqlite/sqlite-error-translator.js';
import { sqlitePlanMapper } from './sqlite-plan.mapper.js';

export class SqlitePlanRepository implements PlanRepository {
  public constructor(private readonly session: SqliteDatabaseSession) {}

  public existsCode(companyId: string, code: string): Promise<boolean> {
    return this.session.execute(async (database) =>
      Boolean(
        await database
          .selectFrom('plans')
          .select('id')
          .where('company_id', '=', companyId)
          .where('code', '=', code)
          .executeTakeFirst(),
      ),
    );
  }

  public findById(companyId: string, planId: string): Promise<Plan | null> {
    return this.session.execute(async (database) => {
      const plan = await database
        .selectFrom('plans')
        .selectAll()
        .where('company_id', '=', companyId)
        .where('id', '=', planId)
        .executeTakeFirst();
      if (plan === undefined) return null;
      const versions = await database
        .selectFrom('plan_versions')
        .selectAll()
        .where('plan_id', '=', plan.id)
        .orderBy('version_number', 'asc')
        .execute();
      return sqlitePlanMapper.toDomain(plan, versions);
    });
  }

  public save(plan: Plan): Promise<void> {
    return this.session.transaction(async () => {
      try {
        await this.session.execute(async (database) => {
          await database
            .insertInto('plans')
            .values({
              code: plan.code.value,
              company_id: plan.companyId,
              created_at: plan.createdAt.toISOString(),
              id: plan.id.value,
              is_active: plan.isActive ? 1 : 0,
              name: plan.name.value,
              service_type: plan.serviceType.value,
              updated_at: plan.updatedAt?.toISOString() ?? null,
            })
            .onConflict((conflict) =>
              conflict.column('id').doUpdateSet({
                is_active: plan.isActive ? 1 : 0,
                updated_at: plan.updatedAt?.toISOString() ?? null,
              }),
            )
            .execute();
          for (const version of plan.versions) {
            await database
              .insertInto('plan_versions')
              .values({
                burst_download_kbps: version.bandwidth.burstDownloadKbps ?? null,
                burst_upload_kbps: version.bandwidth.burstUploadKbps ?? null,
                created_at: version.createdAt.toISOString(),
                download_kbps: version.bandwidth.downloadKbps,
                effective_from: version.effectiveFrom,
                id: version.id.value,
                plan_id: plan.id.value,
                price_cents: version.priceCents,
                priority: version.bandwidth.priority ?? null,
                upload_kbps: version.bandwidth.uploadKbps,
                version_number: version.versionNumber,
              })
              .onConflict((conflict) => conflict.column('id').doNothing())
              .execute();
          }
        });
      } catch (error) {
        if (
          isSqliteConstraintError(error) &&
          error.message.includes('plans.company_id') &&
          error.message.includes('plans.code')
        ) {
          throw new DuplicatePlanCodeError();
        }
        throw error;
      }
    });
  }
}
