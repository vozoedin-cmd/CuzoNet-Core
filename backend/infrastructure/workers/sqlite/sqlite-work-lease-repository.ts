import type { SqliteDatabaseSession } from '../../database/sqlite/sqlite-database-session.js';
import type {
  RenewWorkLeaseInput,
  TryAcquireWorkLeaseInput,
  WorkLease,
  WorkLeaseRepository,
} from '../worker-contracts.js';
import type { WorkerRole } from '../worker-role.js';

interface WorkLeaseRow {
  acquired_at: string;
  expires_at: string;
  fencing_token: number;
  owner_id: string;
  renewed_at: string;
  role: 'automation' | 'outbox' | 'provisioning';
  work_id: string;
}

export class SqliteWorkLeaseRepository implements WorkLeaseRepository {
  public constructor(private readonly session: SqliteDatabaseSession) {}

  public tryAcquire(input: TryAcquireWorkLeaseInput): Promise<WorkLease | null> {
    this.assertDuration(input.durationMs);
    return this.session.transaction(() =>
      this.session.execute(async (database) => {
        const row = await database
          .selectFrom('work_leases')
          .selectAll()
          .where('role', '=', input.role)
          .where('work_id', '=', input.workId)
          .executeTakeFirst();
        const acquiredAt = input.acquiredAt.toISOString();
        const expiresAt = new Date(input.acquiredAt.getTime() + input.durationMs).toISOString();
        if (row === undefined) {
          const created: WorkLeaseRow = {
            acquired_at: acquiredAt,
            expires_at: expiresAt,
            fencing_token: 1,
            owner_id: input.ownerId,
            renewed_at: acquiredAt,
            role: input.role,
            work_id: input.workId,
          };
          await database.insertInto('work_leases').values(created).execute();
          return this.toLease(created);
        }
        if (row.expires_at > acquiredAt) return null;
        const fencingToken = row.fencing_token + 1;
        await database
          .updateTable('work_leases')
          .set({
            acquired_at: acquiredAt,
            expires_at: expiresAt,
            fencing_token: fencingToken,
            owner_id: input.ownerId,
            renewed_at: acquiredAt,
          })
          .where('role', '=', input.role)
          .where('work_id', '=', input.workId)
          .execute();
        return this.toLease({
          ...row,
          acquired_at: acquiredAt,
          expires_at: expiresAt,
          fencing_token: fencingToken,
          owner_id: input.ownerId,
          renewed_at: acquiredAt,
        });
      }),
    );
  }

  public renew(input: RenewWorkLeaseInput): Promise<WorkLease | null> {
    this.assertDuration(input.durationMs);
    return this.session.transaction(() =>
      this.session.execute(async (database) => {
        const renewedAt = input.renewedAt.toISOString();
        const expiresAt = new Date(input.renewedAt.getTime() + input.durationMs).toISOString();
        const result = await database
          .updateTable('work_leases')
          .set({ expires_at: expiresAt, renewed_at: renewedAt })
          .where('role', '=', input.role)
          .where('work_id', '=', input.workId)
          .where('owner_id', '=', input.ownerId)
          .where('fencing_token', '=', input.fencingToken)
          .where('expires_at', '>', renewedAt)
          .executeTakeFirst();
        if (result.numUpdatedRows !== 1n) return null;
        const row = await database
          .selectFrom('work_leases')
          .selectAll()
          .where('role', '=', input.role)
          .where('work_id', '=', input.workId)
          .executeTakeFirstOrThrow();
        return this.toLease(row);
      }),
    );
  }

  public release(lease: WorkLease, releasedAt: Date): Promise<boolean> {
    return this.session.execute(async (database) => {
      const released = releasedAt.toISOString();
      const result = await database
        .updateTable('work_leases')
        .set({ expires_at: released, renewed_at: released })
        .where('role', '=', lease.role)
        .where('work_id', '=', lease.workId)
        .where('owner_id', '=', lease.ownerId)
        .where('fencing_token', '=', lease.fencingToken)
        .executeTakeFirst();
      return result.numUpdatedRows === 1n;
    });
  }

  private toLease(row: WorkLeaseRow): WorkLease {
    return {
      acquiredAt: new Date(row.acquired_at),
      expiresAt: new Date(row.expires_at),
      fencingToken: row.fencing_token,
      ownerId: row.owner_id,
      renewedAt: new Date(row.renewed_at),
      role: row.role as WorkerRole,
      workId: row.work_id,
    };
  }

  private assertDuration(durationMs: number): void {
    if (!Number.isInteger(durationMs) || durationMs < 1)
      throw new RangeError('durationMs debe ser un entero mayor que cero.');
  }
}
