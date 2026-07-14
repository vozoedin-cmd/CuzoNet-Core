import {
  type CreatePlanInput,
  type PlanMutationResult,
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
import { DuplicatePlanCodeError } from '../../../../domain/plans/errors/duplicate-plan-code.error.js';
import { UnsupportedPlanServiceTypeError } from '../../../../domain/plans/errors/unsupported-plan-service-type.error.js';
import { Plan } from '../../../../domain/plans/plan.js';
import { BandwidthProfile } from '../../../../domain/plans/value-objects/bandwidth-profile.js';
import { CompatibleServiceType } from '../../../../domain/plans/value-objects/compatible-service-type.js';
import { PlanCode } from '../../../../domain/plans/value-objects/plan-code.js';
import { PlanId } from '../../../../domain/plans/value-objects/plan-id.js';
import { PlanName } from '../../../../domain/plans/value-objects/plan-name.js';
import { PlanVersionId } from '../../../../domain/plans/value-objects/plan-version-id.js';

export class CreatePlan {
  public constructor(
    private readonly repository: PlanRepository,
    private readonly companyContext: CompanyContext,
    private readonly idGenerator: IdGenerator,
    private readonly clock: Clock,
    private readonly outbox: PlanOutboxPort = { append: () => Promise.resolve() },
    private readonly unitOfWork: PlanUnitOfWork = { execute: (work) => work() },
  ) {}

  public async execute(input: CreatePlanInput): Promise<PlanMutationResult> {
    const companyId = this.companyContext.getCompanyId();
    const code = PlanCode.create(input.code);
    const serviceType = CompatibleServiceType.create(input.serviceType);
    if (serviceType.value !== 'simple_queue') throw new UnsupportedPlanServiceTypeError();
    if (await this.repository.existsCode(companyId, code.value)) {
      throw new DuplicatePlanCodeError();
    }
    const now = this.clock.now();
    const plan = Plan.create({
      bandwidth: BandwidthProfile.create({
        downloadKbps: input.downloadKbps,
        uploadKbps: input.uploadKbps,
      }),
      causationId: input.causationId,
      code,
      companyId,
      correlationId: input.correlationId,
      createdAt: now,
      effectiveFrom: now.toISOString().slice(0, 10),
      eventId: this.idGenerator.generate(),
      id: PlanId.create(this.idGenerator.generate()),
      name: PlanName.create(input.name),
      planVersionId: PlanVersionId.create(this.idGenerator.generate()),
      priceCents: input.priceCents,
      serviceType,
    });
    const domainEvents = plan.pullDomainEvents();
    await this.unitOfWork.execute(async () => {
      await this.repository.save(plan);
      await this.outbox.append(domainEvents);
    });
    return { domainEvents, plan: toPlanDto(plan) };
  }
}
