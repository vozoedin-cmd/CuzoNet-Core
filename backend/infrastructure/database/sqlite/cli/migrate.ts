import { environment } from '../../../config/environment.js';
import { MigrationRunner } from '../migration/migration-runner.js';
import { SqliteDatabase } from '../sqlite-database.js';

const database = new SqliteDatabase({
  busyTimeoutMs: environment.DATABASE_BUSY_TIMEOUT_MS,
  path: environment.DATABASE_PATH,
});

try {
  const runner = new MigrationRunner(database.connection);
  runner.migrate();
  process.stdout.write(`SQLite schema is at version ${runner.currentVersion()}.\n`);
} finally {
  await database.close();
}
