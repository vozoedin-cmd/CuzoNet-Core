import {
  type PlanMutationResult,
  type RevisePlanInput,
  toPlanDto,
} from '../../../dto/plans/plan.dto.js';
import type { Clock } from '../../../ports/clock.port.js';
import type { CompanyContext } from '../../../ports/company-context.port.js';
import type { IdGenerator } from '../../../ports/id-generator.port.js';
import type {
  PlanOutboxPort,
  PlanUnitOfWork,
} from '../../../ports/plans/plan-outbox.port.js';
import type { PlanRepository } from '../../../ports/plans/plan-repository.port.js';
import { PlanNotFoundError } from '../../../../domain/plans/errors/plan-not-found.error.js';
import { BandwidthProfile } from '../../../../domain/plans/value-objects/bandwidth-profile.js';
import { PlanId } from '../../../../domain/plans/value-objects/plan-id.js';
import { PlanVersionId } from '../../../../domain/plans/value-objects/plan-version-id.js';

export class RevisePlan {
  public constructor(
    private readonly repository: PlanRepository,
    private readonly companyContext: CompanyContext,
    private readonly idGenerator: IdGenerator,
    private readonly clock: Clock,
    private readonly outbox: PlanOutboxPort = { append: () => Promise.resolve() },
    private readonly unitOfWork: PlanUnitOfWork = { execute: (work) => work() },
  ) {}

  public async execute(input: RevisePlanInput): Promise<PlanMutationResult> {
    const companyId = this.companyContext.getCompanyId();
    const planId = PlanId.create(input.planId);
    const plan = await this.repository.findById(companyId, planId.value);
    if (plan === null) throw new PlanNotFoundError();
    const now = this.clock.now();
    plan.revise({
      bandwidth: BandwidthProfile.create({
        downloadKbps: input.downloadKbps,
        uploadKbps: input.uploadKbps,
      }),
      causationId: input.causationId,
      correlationId: input.correlationId,
      effectiveFrom: input.effectiveFrom,
      eventId: this.idGenerator.generate(),
      isActive: input.isActive,
      planVersionId: PlanVersionId.create(this.idGenerator.generate()),
      priceCents: input.priceCents,
      revisedAt: now,
    });
    const domainEvents = plan.pullDomainEvents();
    await this.unitOfWork.execute(async () => {
      await this.repository.save(plan);
      await this.outbox.append(domainEvents);
    });
    return { domainEvents, plan: toPlanDto(plan) };
  }
}
