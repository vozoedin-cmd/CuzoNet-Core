import { environment } from '../../../config/environment.js';
import { DatabaseHealthChecker } from '../database-health-checker.js';
import { SqliteDatabase } from '../sqlite-database.js';

const database = new SqliteDatabase({
  busyTimeoutMs: environment.DATABASE_BUSY_TIMEOUT_MS,
  path: environment.DATABASE_PATH,
});

try {
  const result = new DatabaseHealthChecker(database.connection).check();
  if (!result.healthy) {
    process.stderr.write(
      `SQLite health check failed: ${result.integrity}; foreign key violations: ${result.foreignKeyViolations}.\n`,
    );
    process.exitCode = 1;
  } else {
    process.stdout.write('SQLite integrity_check and foreign_key_check passed.\n');
  }
} finally {
  await database.close();
}
