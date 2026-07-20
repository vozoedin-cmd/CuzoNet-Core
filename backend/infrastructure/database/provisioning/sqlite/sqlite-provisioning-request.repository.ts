import type { SqliteDatabaseSession } from '../../sqlite/sqlite-database-session.js';
import type { ProvisioningRequestFilters, ProvisioningRequestPagination, ProvisioningRequestRepository } from '../../../../application/ports/provisioning/provisioning-request-repository.port.js';
import type { ProvisioningRequest } from '../../../../domain/provisioning/provisioning-request.js';
import { SqliteProvisioningRequestMapper } from './sqlite-provisioning-request.mapper.js';

export class SqliteProvisioningRequestRepository implements ProvisioningRequestRepository {
  public constructor(private readonly session: SqliteDatabaseSession) {}

  public async insertNew(request: ProvisioningRequest): Promise<'inserted' | 'conflict'> {
    const row = SqliteProvisioningRequestMapper.toPersistence(request);
    try {
      await this.session.execute(async (db) => {
        await db
          .insertInto('provisioning_requests')
          .values(row)
          .execute();
      });
      return 'inserted';
    } catch (e: unknown) {
      const err = e as { code?: string, message?: string };
      if (err.code === 'SQLITE_CONSTRAINT_UNIQUE' || err.code === 'SQLITE_CONSTRAINT' || (err.message && err.message.includes('UNIQUE constraint failed'))) {
        return 'conflict';
      }
      throw e;
    }
  }

  public async save(request: ProvisioningRequest): Promise<void> {
    const row = SqliteProvisioningRequestMapper.toPersistence(request);
    await this.session.execute(async (db) => {
      await db
        .insertInto('provisioning_requests')
        .values(row)
        .onConflict((oc) =>
          oc.column('id').doUpdateSet({
            action_type: row.action_type,
            attempt_count: row.attempt_count,
            completed_at: row.completed_at,
            configuration_reference: row.configuration_reference,
            input_snapshot_json: row.input_snapshot_json,
            last_error_code: row.last_error_code,
            last_error_message: row.last_error_message,
            max_attempts: row.max_attempts,
            next_attempt_at: row.next_attempt_at,
            processing_started_at: row.processing_started_at,
            processing_worker_id: row.processing_worker_id,
            source_execution_id: row.source_execution_id,
            status: row.status,
            target_id: row.target_id,
            target_type: row.target_type,
            updated_at: row.updated_at,
          }),
        )
        .execute();
    });
  }

  public async findById(id: string): Promise<ProvisioningRequest | undefined> {
    return this.session.execute(async (db) => {
      const row = await db
        .selectFrom('provisioning_requests')
        .selectAll()
        .where('id', '=', id)
        .executeTakeFirst();
      return row ? SqliteProvisioningRequestMapper.toDomain(row) : undefined;
    });
  }

  public async findByIdempotencyKey(companyId: string, idempotencyKey: string): Promise<ProvisioningRequest | undefined> {
    return this.session.execute(async (db) => {
      const row = await db
        .selectFrom('provisioning_requests')
        .selectAll()
        .where('company_id', '=', companyId)
        .where('idempotency_key', '=', idempotencyKey)
        .executeTakeFirst();
      return row ? SqliteProvisioningRequestMapper.toDomain(row) : undefined;
    });
  }

  public async claimDue(limit: number, workerId: string, at: Date): Promise<readonly ProvisioningRequest[]> {
    const nowIso = at.toISOString();

    return this.session.execute(async (db) => {
      const pending = await db
        .selectFrom('provisioning_requests')
        .select('id')
        .where('status', '=', 'pending')
        .where((eb) =>
          eb.or([
            eb('next_attempt_at', 'is', null),
            eb('next_attempt_at', '<=', nowIso),
          ]),
        )
        .limit(limit)
        .execute();

      const failed = await db
        .selectFrom('provisioning_requests')
        .select('id')
        .where('status', '=', 'failed')
        .where('next_attempt_at', 'is not', null)
        .where('next_attempt_at', '<=', nowIso)
        .whereRef('attempt_count', '<', 'max_attempts')
        .limit(limit)
        .execute();

      const ids = [...pending, ...failed].map((r) => r.id).slice(0, limit);

      if (ids.length === 0) {
        return [];
      }

      const rows = await db
        .updateTable('provisioning_requests')
        .set({
          processing_started_at: nowIso,
          processing_worker_id: workerId,
          status: 'processing',
          updated_at: nowIso,
        })
        .where('id', 'in', ids)
        .returningAll()
        .execute();

      return rows.map(SqliteProvisioningRequestMapper.toDomain);
    });
  }

  public async list(
    filters: ProvisioningRequestFilters,
    pagination: ProvisioningRequestPagination,
  ): Promise<{ items: readonly ProvisioningRequest[]; total: number }> {
    return this.session.execute(async (db) => {
      let query = db.selectFrom('provisioning_requests');

      if (filters.companyId) {
        query = query.where('company_id', '=', filters.companyId);
      }
      if (filters.status) {
        query = query.where('status', '=', filters.status);
      }
      if (filters.actionType) {
        query = query.where('action_type', '=', filters.actionType);
      }

      const [totalRow, rows] = await Promise.all([
        query
          .select((eb) => eb.fn.count<number>('id').as('count'))
          .executeTakeFirstOrThrow(),
        query
          .selectAll()
          .orderBy('created_at', 'desc')
          .offset(pagination.offset)
          .limit(pagination.limit)
          .execute(),
      ]);

      return {
        items: rows.map(SqliteProvisioningRequestMapper.toDomain),
        total: totalRow.count,
      };
    });
  }
}
