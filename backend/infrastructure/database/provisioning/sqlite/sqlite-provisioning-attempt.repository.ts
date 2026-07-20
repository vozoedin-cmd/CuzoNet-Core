import type { SqliteDatabaseSession } from '../../sqlite/sqlite-database-session.js';
import type { ProvisioningAttemptRepository } from '../../../../application/ports/provisioning/provisioning-attempt-repository.port.js';
import type { ProvisioningAttempt } from '../../../../domain/provisioning/provisioning-attempt.js';
import { SqliteProvisioningAttemptMapper } from './sqlite-provisioning-attempt.mapper.js';

export class SqliteProvisioningAttemptRepository implements ProvisioningAttemptRepository {
  public constructor(private readonly session: SqliteDatabaseSession) {}

  public async save(attempt: ProvisioningAttempt): Promise<void> {
    const row = SqliteProvisioningAttemptMapper.toPersistence(attempt);
    await this.session.execute(async (db) => {
      await db
        .insertInto('provisioning_attempts')
        .values(row)
        .onConflict((oc) =>
          oc.column('id').doUpdateSet({
            duration_ms: row.duration_ms,
            error_code: row.error_code,
            error_message: row.error_message,
            finished_at: row.finished_at,
            metadata_json: row.metadata_json,
            outcome: row.outcome,
          }),
        )
        .execute();
    });
  }

  public async findByRequestId(requestId: string): Promise<readonly ProvisioningAttempt[]> {
    return this.session.execute(async (db) => {
      const rows = await db
        .selectFrom('provisioning_attempts')
        .selectAll()
        .where('request_id', '=', requestId)
        .orderBy('attempt_number', 'asc')
        .execute();
      return rows.map(SqliteProvisioningAttemptMapper.toDomain);
    });
  }
}
