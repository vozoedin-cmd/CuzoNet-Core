import type { GenerateReconciliationPlanInput, ReconciliationPlanDto } from '../../dto/synchronization/reconciliation-plan.dto.js';
import { ReconciliationPlanMapper } from '../../mappers/synchronization/reconciliation-plan.mapper.js';
import type { Clock } from '../../ports/clock.port.js';
import type { CompanyContext } from '../../ports/company-context.port.js';
import type { ActualStateReader } from '../../ports/synchronization/actual-state-reader.port.js';
import type { DesiredStateRepository } from '../../ports/synchronization/desired-state-repository.port.js';
import { compareNormalizedRecords } from '../../../domain/synchronization/reconciliation-comparator.js';
import type { ReconciliationItem } from '../../../domain/synchronization/reconciliation-item.js';
import { ReconciliationPlan } from '../../../domain/synchronization/reconciliation-plan.js';
import { SYNC_RESOURCE_TYPES } from '../../../domain/synchronization/sync-resource-type.js';

/**
 * Phase 1 of the RouterOS Synchronization Engine: reads desired and actual
 * state for each resource type, compares them by stable reference, and
 * returns a dry-run reconciliation plan. It never mutates the router —
 * applying a plan (handing "missing"/"drifted" items to the Provisioning
 * Engine) is a future phase.
 */
export class GenerateReconciliationPlan {
  public constructor(
    private readonly desiredStateRepository: DesiredStateRepository,
    private readonly actualStateReader: ActualStateReader,
    private readonly companyContext: CompanyContext,
    private readonly clock: Clock,
  ) {}

  public async execute(input: GenerateReconciliationPlanInput): Promise<ReconciliationPlanDto> {
    const companyId = this.companyContext.getCompanyId();
    const resourceTypes = input.resourceTypes ?? SYNC_RESOURCE_TYPES;

    const items: ReconciliationItem[] = [];
    for (const resourceType of resourceTypes) {
      const [desired, actual] = await Promise.all([
        this.desiredStateRepository.getDesiredState(companyId, input.routerId, resourceType),
        this.actualStateReader.readActualState(companyId, input.routerId, resourceType),
      ]);
      items.push(...compareNormalizedRecords(resourceType, desired, actual));
    }

    const plan = ReconciliationPlan.create(companyId, input.routerId, this.clock.now(), items);
    return ReconciliationPlanMapper.toDto(plan);
  }
}
