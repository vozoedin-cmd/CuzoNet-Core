import type { ServiceReader } from '../../../../application/ports/services/service-reader.port.js';
import type { ServiceRepository } from '../../../../application/ports/services/service-repository.port.js';
import type { Service } from '../../../../domain/services/service.js';
import type { SqliteDatabaseSession } from '../../sqlite/sqlite-database-session.js';
import { sqliteServiceMapper } from './sqlite-service.mapper.js';

export class SqliteServiceRepository implements ServiceRepository, ServiceReader {
  public constructor(private readonly session: SqliteDatabaseSession) {}

  public save(service: Service): Promise<void> {
    return this.session.execute(async (database) => {
      await database
        .insertInto('client_services')
        .values({
          billing_day: service.billingDay.value,
          client_id: service.clientId.value,
          company_id: service.companyId,
          created_at: service.createdAt.toISOString(),
          ended_on: null,
          id: service.id.value,
          lifecycle_status: service.lifecycleStatus.value,
          plan_version_id: service.planVersionId.value,
          service_type: service.serviceType.value,
          started_on: service.startedOn?.toISOString() ?? null,
        })
        .onConflict((conflict) =>
          conflict.column('id').doUpdateSet({
            lifecycle_status: service.lifecycleStatus.value,
            started_on: service.startedOn?.toISOString() ?? null,
          }),
        )
        .execute();
    });
  }

  public findById(companyId: string, serviceId: string): Promise<Service | null> {
    return this.session.execute(async (database) => {
      const row = await database
        .selectFrom('client_services')
        .selectAll()
        .where('company_id', '=', companyId)
        .where('id', '=', serviceId)
        .executeTakeFirst();
      return row === undefined ? null : sqliteServiceMapper.toDomain(row);
    });
  }

  public listByClient(companyId: string, clientId: string): Promise<readonly Service[]> {
    return this.session.execute(async (database) =>
      (
        await database
          .selectFrom('client_services')
          .selectAll()
          .where('company_id', '=', companyId)
          .where('client_id', '=', clientId)
          .orderBy('created_at', 'desc')
          .orderBy('id', 'asc')
          .execute()
      ).map(sqliteServiceMapper.toDomain),
    );
  }
}
