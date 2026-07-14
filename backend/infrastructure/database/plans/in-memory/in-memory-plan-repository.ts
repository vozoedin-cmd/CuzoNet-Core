import { toPlanDto } from '../../../../application/dto/plans/plan.dto.js';
import type { PlanReader } from '../../../../application/ports/plans/plan-reader.port.js';
import type { PlanRepository } from '../../../../application/ports/plans/plan-repository.port.js';
import type {
  ResolvedProvisioningProfile,
  ResolvedProvisioningProfileReader,
} from '../../../../application/ports/plans/resolved-provisioning-profile-reader.port.js';
import type { Plan } from '../../../../domain/plans/plan.js';

export class InMemoryPlanRepository
  implements PlanRepository, PlanReader, ResolvedProvisioningProfileReader
{
  private readonly records = new Map<string, Plan>();

  public existsCode(companyId: string, code: string): Promise<boolean> {
    return Promise.resolve(
      [...this.records.values()].some(
        (plan) => plan.companyId === companyId && plan.code.value === code,
      ),
    );
  }

  public findById(companyId: string, planId: string): Promise<Plan | null> {
    const plan = this.records.get(`${companyId}:${planId}`);
    return Promise.resolve(plan ?? null);
  }

  public save(plan: Plan): Promise<void> {
    this.records.set(`${plan.companyId}:${plan.id.value}`, plan);
    return Promise.resolve();
  }

  public listActive(companyId: string) {
    return Promise.resolve(
      [...this.records.values()]
        .filter((plan) => plan.companyId === companyId && plan.isActive)
        .sort((left, right) => left.code.value.localeCompare(right.code.value))
        .map(toPlanDto),
    );
  }

  public findByPlanVersionId(
    companyId: string,
    planVersionId: string,
  ): Promise<ResolvedProvisioningProfile | null> {
    for (const plan of this.records.values()) {
      if (plan.companyId !== companyId || plan.serviceType.value !== 'simple_queue') continue;
      const version = plan.versions.find((candidate) => candidate.id.value === planVersionId);
      if (version !== undefined) {
        return Promise.resolve({
          downloadKbps: version.bandwidth.downloadKbps,
          planVersionId,
          serviceType: plan.serviceType.value,
          uploadKbps: version.bandwidth.uploadKbps,
        });
      }
    }
    return Promise.resolve(null);
  }
}
