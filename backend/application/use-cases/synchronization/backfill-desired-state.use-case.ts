import type {
  BackfillDesiredStateInput,
  BackfillRouterResourceResult,
  BackfillSummaryDto,
} from '../../dto/synchronization/backfill-desired-state.dto.js';
import type { Clock } from '../../ports/clock.port.js';
import type { CompanyContext } from '../../ports/company-context.port.js';
import type { IdGenerator } from '../../ports/id-generator.port.js';
import type { ProvisioningRequestRepository } from '../../ports/provisioning/provisioning-request-repository.port.js';
import type { DesiredResourceStateRepository } from '../../ports/synchronization/desired-resource-state-repository.port.js';
import type { DesiredStateRepository } from '../../ports/synchronization/desired-state-repository.port.js';
import { discoverRouterIds } from './discover-router-ids.util.js';
import { DesiredResourceState } from '../../../domain/synchronization/desired-resource-state.js';
import { SYNC_RESOURCE_TYPES } from '../../../domain/synchronization/sync-resource-type.js';

/**
 * A one-shot, manually-run migration: seeds the declarative desired-state
 * store (Hito 21.5) from the Provisioning Engine's completed-request
 * history (the same source ProvisioningHistoryDesiredStateRepository reads
 * from) for any (router, resourceType, reference) identity the store
 * doesn't already know about.
 *
 * It only ever fills gaps. An identity that already has ANY row in the
 * declarative store — active or soft-deleted — is left untouched, because
 * that row represents a deliberate decision (an explicit declaration, or
 * an explicit removal) an operator already made through the Hito 21.5 API;
 * history must never override that. This is also what makes re-running the
 * tool safe: the first run fills every gap it can see, and every run after
 * that finds nothing left to do.
 *
 * Never touches RouterOS — it only moves data between two read models
 * already backed by the same SQLite database.
 */
export class BackfillDesiredState {
  public constructor(
    private readonly historyDesiredStateRepository: DesiredStateRepository,
    private readonly desiredResourceStateRepository: DesiredResourceStateRepository,
    private readonly provisioningRequestRepository: ProvisioningRequestRepository,
    private readonly companyContext: CompanyContext,
    private readonly clock: Clock,
    private readonly idGenerator: IdGenerator,
  ) {}

  public async execute(input: BackfillDesiredStateInput): Promise<BackfillSummaryDto> {
    const companyId = this.companyContext.getCompanyId();
    const routerIds = input.routerIds ?? (await discoverRouterIds(this.provisioningRequestRepository, companyId));
    const resourceTypes = input.resourceTypes ?? SYNC_RESOURCE_TYPES;

    const perRouter: BackfillRouterResourceResult[] = [];
    for (const routerId of routerIds) {
      for (const resourceType of resourceTypes) {
        const historical = await this.historyDesiredStateRepository.getDesiredState(companyId, routerId, resourceType);
        if (historical.length === 0) continue;

        let created = 0;
        let skipped = 0;
        for (const record of historical) {
          const existing = await this.desiredResourceStateRepository.findByReference(
            companyId,
            routerId,
            resourceType,
            record.reference,
          );
          if (existing !== undefined) {
            skipped += 1;
            continue;
          }

          created += 1;
          if (!input.dryRun) {
            const state = DesiredResourceState.create(
              {
                companyId,
                desiredFields: { ...record.fields },
                disabled: record.disabled,
                id: this.idGenerator.generate(),
                reference: record.reference,
                resourceType,
                routerId,
              },
              this.clock.now(),
            );
            await this.desiredResourceStateRepository.save(state);
          }
        }

        perRouter.push({ created, resourceType, routerId, scanned: historical.length, skipped });
      }
    }

    return {
      dryRun: input.dryRun,
      perRouter,
      totals: {
        created: perRouter.reduce((sum, row) => sum + row.created, 0),
        routersScanned: routerIds.length,
        scanned: perRouter.reduce((sum, row) => sum + row.scanned, 0),
        skipped: perRouter.reduce((sum, row) => sum + row.skipped, 0),
      },
    };
  }
}
