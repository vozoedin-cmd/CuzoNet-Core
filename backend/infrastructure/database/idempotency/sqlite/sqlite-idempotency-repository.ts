import type {
  IdempotencyRecord,
  IdempotencyRepository,
} from '../../../../application/ports/idempotency/idempotency-repository.port.js';
import type { SqliteDatabaseSession } from '../../sqlite/sqlite-database-session.js';

export class SqliteIdempotencyRepository implements IdempotencyRepository {
  public constructor(private readonly session: SqliteDatabaseSession) {}

  public find(
    apiClientId: string,
    requestMethod: string,
    requestPath: string,
    key: string,
  ): Promise<IdempotencyRecord | null> {
    return this.session.execute(async (database) => {
      const row = await database
        .selectFrom('idempotency_keys')
        .selectAll()
        .where('api_client_id', '=', apiClientId)
        .where('request_method', '=', requestMethod)
        .where('request_path', '=', requestPath)
        .where('key', '=', key)
        .executeTakeFirst();
      return row === undefined
        ? null
        : {
            apiClientId: row.api_client_id,
            ...(row.completed_at === null ? {} : { completedAt: row.completed_at }),
            createdAt: row.created_at,
            expiresAt: row.expires_at,
            id: row.id,
            key: row.key,
            requestHash: row.request_hash,
            requestMethod: row.request_method,
            requestPath: row.request_path,
            ...(row.response_body === null ? {} : { responseBody: row.response_body }),
            ...(row.response_status === null ? {} : { responseStatus: row.response_status }),
            status: row.status as IdempotencyRecord['status'],
          };
    });
  }

  public save(record: IdempotencyRecord): Promise<void> {
    return this.session.execute(async (database) => {
      await database
        .insertInto('idempotency_keys')
        .values({
          api_client_id: record.apiClientId,
          completed_at: record.completedAt ?? null,
          created_at: record.createdAt,
          expires_at: record.expiresAt,
          id: record.id,
          key: record.key,
          request_hash: record.requestHash,
          request_method: record.requestMethod,
          request_path: record.requestPath,
          response_body: record.responseBody ?? null,
          response_status: record.responseStatus ?? null,
          status: record.status,
        })
        .onConflict((conflict) =>
          conflict.columns(['api_client_id', 'request_method', 'request_path', 'key']).doUpdateSet({
            completed_at: record.completedAt ?? null,
            expires_at: record.expiresAt,
            request_hash: record.requestHash,
            response_body: record.responseBody ?? null,
            response_status: record.responseStatus ?? null,
            status: record.status,
          }),
        )
        .execute();
    });
  }
}
