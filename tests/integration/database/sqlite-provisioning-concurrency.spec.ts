import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { SqliteDatabaseSession } from '../../../backend/infrastructure/database/sqlite/sqlite-database-session.js';
import { SqliteProvisioningRequestRepository } from '../../../backend/infrastructure/database/provisioning/sqlite/sqlite-provisioning-request.repository.js';
import { RequestProvisioning } from '../../../backend/application/use-cases/provisioning/request-provisioning/request-provisioning.use-case.js';
import { ProvisioningIdempotencyConflictError } from '../../../backend/domain/provisioning/errors/provisioning-engine.error.js';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { Kysely, SqliteDialect } from 'kysely';
import type { DatabaseSchema } from '../../../backend/infrastructure/database/sqlite/database-schema.js';

describe('Provisioning Engine SQLite Concurrency', () => {
  let session: SqliteDatabaseSession;
  let repository: SqliteProvisioningRequestRepository;
  let useCase: RequestProvisioning;
  const dbPath = path.join(process.cwd(), 'test-provisioning-concurrency.sqlite');
  let db: Database.Database;

  beforeEach(async () => {
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');

    const kyselyDb = new Kysely<DatabaseSchema>({
      dialect: new SqliteDialect({ database: db })
    });
    session = new SqliteDatabaseSession(kyselyDb, db);
    
    // Create necessary schema
    await kyselyDb.schema.createTable('provisioning_requests')
      .addColumn('id', 'text', (cb) => cb.primaryKey())
      .addColumn('company_id', 'text', (cb) => cb.notNull())
      .addColumn('source_execution_id', 'text')
      .addColumn('idempotency_key', 'text', (cb) => cb.notNull())
      .addColumn('action_type', 'text', (cb) => cb.notNull())
      .addColumn('target_type', 'text', (cb) => cb.notNull())
      .addColumn('target_id', 'text', (cb) => cb.notNull())
      .addColumn('configuration_reference', 'text')
      .addColumn('input_hash', 'text', (cb) => cb.notNull())
      .addColumn('input_snapshot_json', 'text', (cb) => cb.notNull())
      .addColumn('status', 'text', (cb) => cb.notNull())
      .addColumn('attempt_count', 'integer', (cb) => cb.notNull())
      .addColumn('max_attempts', 'integer', (cb) => cb.notNull())
      .addColumn('next_attempt_at', 'text')
      .addColumn('processing_worker_id', 'text')
      .addColumn('processing_started_at', 'text')
      .addColumn('completed_at', 'text')
      .addColumn('last_error_code', 'text')
      .addColumn('last_error_message', 'text')
      .addColumn('created_at', 'text', (cb) => cb.notNull())
      .addColumn('updated_at', 'text', (cb) => cb.notNull())
      .execute();
      
    await kyselyDb.schema.createIndex('provisioning_requests_idempotency_idx')
      .on('provisioning_requests')
      .columns(['company_id', 'idempotency_key'])
      .unique()
      .execute();

    repository = new SqliteProvisioningRequestRepository(session);
    useCase = new RequestProvisioning(
      repository, 
      { getCompanyId: () => 'company-1' }, 
      { generate: () => randomUUID() }, 
      5
    );
  });

  afterEach(async () => {
    db.close();
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  });

  it('two concurrent identical requests -> one row and both receive same request', async () => {
    const p1 = useCase.execute({
      actionType: 'test',
      idempotencyKey: 'concurrent-1',
      inputSnapshotJson: '{"a":1}',
      targetId: 'tgt-1',
      targetType: 'test_type'
    });

    const p2 = useCase.execute({
      actionType: 'test',
      idempotencyKey: 'concurrent-1',
      inputSnapshotJson: '{"a":1}',
      targetId: 'tgt-1',
      targetType: 'test_type'
    });

    const [res1, res2] = await Promise.all([p1, p2]);
    
    expect(res1.id).toBe(res2.id); // Same ID means they got the exact same request entity
    expect(res1.idempotencyKey).toBe('concurrent-1');
  });

  it('two concurrent requests with same key but different content -> one wins, the other gets 409', async () => {
    // To ensure they truly hit concurrency, we run them simultaneously.
    // One will succeed the INSERT, the other will fail the UNIQUE constraint and throw 409.
    
    const p1 = useCase.execute({
      actionType: 'test',
      idempotencyKey: 'concurrent-2',
      inputSnapshotJson: '{"a":1}',
      targetId: 'tgt-1',
      targetType: 'test_type'
    });

    const p2 = useCase.execute({
      actionType: 'test',
      idempotencyKey: 'concurrent-2',
      inputSnapshotJson: '{"a":2}', // Different content!
      targetId: 'tgt-1',
      targetType: 'test_type'
    });

    const results = await Promise.allSettled([p1, p2]);
    
    const fulfilled = results.filter(r => r.status === 'fulfilled');
    const rejected = results.filter(r => r.status === 'rejected');
    
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    
    const error = (rejected[0] as PromiseRejectedResult).reason;
    expect(error).toBeInstanceOf(ProvisioningIdempotencyConflictError);
    expect(error.code).toBe('IDEMPOTENCY_CONFLICT');
  });
});
