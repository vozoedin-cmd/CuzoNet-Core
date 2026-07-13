import { join } from 'node:path';

import { environment } from '../../../config/environment.js';
import { SqliteBackup } from '../backup/sqlite-backup.js';
import { SqliteDatabase } from '../sqlite-database.js';

const database = new SqliteDatabase({
  busyTimeoutMs: environment.DATABASE_BUSY_TIMEOUT_MS,
  path: environment.DATABASE_PATH,
});
const timestamp = new Date().toISOString().replaceAll(':', '-');
const destination = join(environment.DATABASE_BACKUP_PATH, `cuzonet-${timestamp}.sqlite`);

try {
  await new SqliteBackup(database.connection).create(destination);
  process.stdout.write(`SQLite backup created at ${destination}.\n`);
} finally {
  await database.close();
}
