import { resolve } from 'node:path';

import { environment } from '../../config/environment.js';
import { CompanyBootstrap } from '../../database/sqlite/bootstrap/company-bootstrap.js';
import { DatabaseHealthChecker } from '../../database/sqlite/database-health-checker.js';
import { MigrationRunner } from '../../database/sqlite/migration/migration-runner.js';
import { SqliteDatabase } from '../../database/sqlite/sqlite-database.js';
import { SqliteProvisioningRequestRepository } from '../../database/provisioning/sqlite/sqlite-provisioning-request.repository.js';
import { SqliteDesiredResourceStateRepository } from '../../database/synchronization/sqlite/sqlite-desired-resource-state.repository.js';
import { UuidV7IdGenerator } from '../../identity/uuid-v7-id-generator.js';
import { SqliteSingleCompanyContext } from '../../tenancy/sqlite-single-company-context.js';
import { BackfillDesiredState } from '../../../application/use-cases/synchronization/backfill-desired-state.use-case.js';
import { discoverRouterIds } from '../../../application/use-cases/synchronization/discover-router-ids.util.js';
import { SYNC_RESOURCE_TYPES, type SyncResourceType } from '../../../domain/synchronization/sync-resource-type.js';
import { ProvisioningHistoryDesiredStateRepository } from '../provisioning-history-desired-state.repository.js';

/**
 * Hito 21.6 — one-shot backfill: seeds the declarative desired-state store
 * from the Provisioning Engine's completed-request history. Manual-only by
 * design (no HTTP route) — run via `npm run backfill:desired-state -- [flags]`.
 *
 * Flags:
 *   --dry-run                     report what would be created, write nothing
 *   --router-ids=r1,r2            limit to these routers (default: auto-discover)
 *   --resource-types=filter-rule  limit to these resource types (default: all five)
 *   --diagnose                    print DB path + request/router counts, write nothing, then exit
 *                                  (use this first if the backfill reports 0 routers discovered)
 */
interface ParsedArgs {
  diagnose: boolean;
  dryRun: boolean;
  resourceTypes: SyncResourceType[] | undefined;
  routerIds: string[] | undefined;
}

function parseArgs(argv: readonly string[]): ParsedArgs {
  const dryRun = argv.includes('--dry-run');
  const diagnose = argv.includes('--diagnose');

  const routerIdsFlag = argv.find((arg) => arg.startsWith('--router-ids='));
  const routerIds = routerIdsFlag
    ? routerIdsFlag
        .slice('--router-ids='.length)
        .split(',')
        .map((value) => value.trim())
        .filter((value) => value.length > 0)
    : undefined;

  const resourceTypesFlag = argv.find((arg) => arg.startsWith('--resource-types='));
  const rawResourceTypes = resourceTypesFlag
    ? resourceTypesFlag
        .slice('--resource-types='.length)
        .split(',')
        .map((value) => value.trim())
        .filter((value) => value.length > 0)
    : undefined;
  if (rawResourceTypes) {
    for (const value of rawResourceTypes) {
      if (!(SYNC_RESOURCE_TYPES as readonly string[]).includes(value)) {
        throw new Error(`--resource-types inválido: "${value}". Debe ser uno de: ${SYNC_RESOURCE_TYPES.join(', ')}.`);
      }
    }
  }

  return { diagnose, dryRun, resourceTypes: rawResourceTypes as SyncResourceType[] | undefined, routerIds };
}

interface CountRow {
  c: number;
}

/**
 * Read-only report answering, in order, the questions that actually explain
 * a "0 routers discovered" result: which file did we open, how many
 * ProvisioningRequest rows exist in it, how many are completed, which
 * company owns them (vs. the company CompanyBootstrap resolved), and which
 * routerIds the exact same discovery the backfill uses would find. Never
 * touches the declarative store.
 */
function printDiagnostics(database: SqliteDatabase, companyId: string, routerIds: readonly string[]): void {
  const resolvedPath = resolve(environment.DATABASE_PATH);
  const total = database.connection.prepare('SELECT COUNT(*) AS c FROM provisioning_requests').get() as CountRow;
  const completed = database.connection
    .prepare("SELECT COUNT(*) AS c FROM provisioning_requests WHERE status = 'completed'")
    .get() as CountRow;
  const companiesInHistory = database.connection
    .prepare('SELECT DISTINCT company_id AS id FROM provisioning_requests')
    .all() as { id: string }[];

  process.stdout.write(`SQLite: ${resolvedPath}\n\n`);
  process.stdout.write(`ProvisioningRequests: ${total.c}\n`);
  process.stdout.write(`Completed: ${completed.c}\n\n`);
  process.stdout.write(`CompanyId activo (CompanyBootstrap): ${companyId}\n`);
  const otherCompanies = companiesInHistory.map((row) => row.id).filter((id) => id !== companyId);
  if (otherCompanies.length > 0) {
    process.stdout.write(`⚠ El historial también contiene company_id distintos al activo: ${otherCompanies.join(', ')}\n`);
  }
  process.stdout.write('\n');

  if (routerIds.length === 0) {
    process.stdout.write('Router IDs encontrados: (ninguno)\n');
  } else {
    process.stdout.write('Router IDs encontrados:\n');
    for (const routerId of routerIds) {
      process.stdout.write(`- ${routerId}\n`);
    }
  }
}

const { diagnose, dryRun, resourceTypes, routerIds } = parseArgs(process.argv.slice(2));

const clock = { now: () => new Date() };
const idGenerator = new UuidV7IdGenerator();
const database = new SqliteDatabase({
  busyTimeoutMs: environment.DATABASE_BUSY_TIMEOUT_MS,
  path: environment.DATABASE_PATH,
});

try {
  new MigrationRunner(database.connection, clock).migrate();
  const companyId = await new CompanyBootstrap(database.session, idGenerator).bootstrap(
    {
      currencyCode: 'GTQ',
      displayName: environment.APP_NAME,
      legalName: environment.APP_NAME,
      timezone: environment.TIMEZONE,
    },
    clock.now(),
  );
  new DatabaseHealthChecker(database.connection).assertHealthy();
  const companyContext = new SqliteSingleCompanyContext(companyId);

  const provisioningRequestRepository = new SqliteProvisioningRequestRepository(database.session);

  if (diagnose) {
    const discoveredRouterIds = routerIds ?? (await discoverRouterIds(provisioningRequestRepository, companyId));
    printDiagnostics(database, companyId, discoveredRouterIds);
  } else {
    const desiredResourceStateRepository = new SqliteDesiredResourceStateRepository(database.session);
    const historyDesiredStateRepository = new ProvisioningHistoryDesiredStateRepository(provisioningRequestRepository);

    const backfill = new BackfillDesiredState(
      historyDesiredStateRepository,
      desiredResourceStateRepository,
      provisioningRequestRepository,
      companyContext,
      clock,
      idGenerator,
    );

    const summary = await backfill.execute({
      dryRun,
      ...(resourceTypes !== undefined ? { resourceTypes } : {}),
      ...(routerIds !== undefined ? { routerIds } : {}),
    });

    const prefix = dryRun ? '[dry-run] ' : '';
    process.stdout.write(`${prefix}Backfill de estado deseado completado.\n`);
    process.stdout.write(`Routers considerados: ${summary.totals.routersScanned}\n`);
    for (const row of summary.perRouter) {
      process.stdout.write(
        `  router=${row.routerId} resourceType=${row.resourceType} escaneados=${row.scanned} creados=${row.created} omitidos=${row.skipped}\n`,
      );
    }
    process.stdout.write(
      `Totales: escaneados=${summary.totals.scanned} creados=${summary.totals.created} omitidos=${summary.totals.skipped}\n`,
    );
    if (summary.totals.routersScanned === 0 || summary.totals.scanned === 0) {
      process.stdout.write(
        '\nNo se encontró historial que respaldar. Ejecuta con --diagnose para confirmar qué base SQLite se está leyendo y cuántas ProvisioningRequest existen.\n',
      );
    }
  }
} finally {
  await database.close();
}
