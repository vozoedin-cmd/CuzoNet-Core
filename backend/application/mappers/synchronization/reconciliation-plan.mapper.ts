import type { ReconciliationItemDto, ReconciliationPlanDto } from '../../dto/synchronization/reconciliation-plan.dto.js';
import type { ReconciliationItem } from '../../../domain/synchronization/reconciliation-item.js';
import type { ReconciliationPlan } from '../../../domain/synchronization/reconciliation-plan.js';

export class ReconciliationPlanMapper {
  public static toDto(plan: ReconciliationPlan): ReconciliationPlanDto {
    return {
      companyId: plan.companyId,
      generatedAt: plan.generatedAt.toISOString(),
      items: plan.items.map(ReconciliationPlanMapper.itemToDto),
      mode: plan.mode,
      routerId: plan.routerId,
      summary: plan.summary,
    };
  }

  private static itemToDto(item: ReconciliationItem): ReconciliationItemDto {
    return {
      ...(item.actualFields !== undefined ? { actualFields: { ...item.actualFields } } : {}),
      ...(item.desiredFields !== undefined ? { desiredFields: { ...item.desiredFields } } : {}),
      ...(item.differingFields !== undefined ? { differingFields: [...item.differingFields] } : {}),
      reference: item.reference,
      resourceType: item.resourceType,
      status: item.status,
    };
  }
}
