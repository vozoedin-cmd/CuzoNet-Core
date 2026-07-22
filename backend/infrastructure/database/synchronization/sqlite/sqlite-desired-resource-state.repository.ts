import type { SqliteDatabaseSession } from '../../sqlite/sqlite-database-session.js';
import type { DesiredResourceStateRepository } from '../../../../application/ports/synchronization/desired-resource-state-repository.port.js';
import type { DesiredResourceState } from '../../../../domain/synchronization/desired-resource-state.js';
import type { SyncResourceType } from '../../../../domain/synchronization/sync-resource-type.js';
import { SqliteDesiredResourceStateMapper } from './sqlite-desired-resource-state.mapper.js';

export class SqliteDesiredResourceStateRepository implements DesiredResourceStateRepository {
  public constructor(private readonly session: SqliteDatabaseSession) {}

  public async findByReference(
    companyId: string,
    routerId: string,
    resourceType: SyncResourceType,
    reference: string,
  ): Promise<DesiredResourceState | undefined> {
    return this.session.execute(async (db) => {
      const row = await db
        .selectFrom('desired_resource_states')
        .selectAll()
        .where('company_id', '=', companyId)
        .where('router_id', '=', routerId)
        .where('resource_type', '=', resourceType)
        .where('resource_reference', '=', reference)
        .executeTakeFirst();
      return row ? SqliteDesiredResourceStateMapper.toDomain(row) : undefined;
    });
  }

  public async listByRouter(
    companyId: string,
    routerId: string,
    resourceType: SyncResourceType,
  ): Promise<readonly DesiredResourceState[]> {
    return this.session.execute(async (db) => {
      const rows = await db
        .selectFrom('desired_resource_states')
        .selectAll()
        .where('company_id', '=', companyId)
        .where('router_id', '=', routerId)
        .where('resource_type', '=', resourceType)
        .where('deleted_at', 'is', null)
        .execute();
      return rows.map(SqliteDesiredResourceStateMapper.toDomain);
    });
  }

  public async save(state: DesiredResourceState): Promise<void> {
    const row = SqliteDesiredResourceStateMapper.toPersistence(state);
    await this.session.execute(async (db) => {
      await db
        .insertInto('desired_resource_states')
        .values(row)
        .onConflict((oc) =>
          oc.column('id').doUpdateSet({
            deleted_at: row.deleted_at,
            desired_fields_json: row.desired_fields_json,
            desired_position: row.desired_position,
            disabled: row.disabled,
            revision: row.revision,
            updated_at: row.updated_at,
          }),
        )
        .execute();
    });
  }
}
