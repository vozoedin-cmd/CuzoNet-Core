import {
  type CreateServiceInput,
  type CreateServiceResult,
  toServiceDto,
} from '../../../dto/services/service.dto.js';
import type { ClientRepository } from '../../../ports/clients/client-repository.port.js';
import type { Clock } from '../../../ports/clock.port.js';
import type { CompanyContext } from '../../../ports/company-context.port.js';
import type { IdGenerator } from '../../../ports/id-generator.port.js';
import type { ServiceRepository } from '../../../ports/services/service-repository.port.js';
import type {
  ServiceOutboxPort,
  ServiceUnitOfWork,
} from '../../../ports/services/service-outbox.port.js';
import { ClientNotFoundError } from '../../../../domain/clients/errors/client-not-found.error.js';
import { Service } from '../../../../domain/services/service.js';
import { ClientCannotReceiveServiceError } from '../../../../domain/services/errors/client-cannot-receive-service.error.js';
import { BillingDay } from '../../../../domain/services/value-objects/billing-day.js';
import { ClientReferenceId } from '../../../../domain/services/value-objects/client-reference-id.js';
import { PlanVersionId } from '../../../../domain/services/value-objects/plan-version-id.js';
import { ServiceId } from '../../../../domain/services/value-objects/service-id.js';
import { ServiceType } from '../../../../domain/services/value-objects/service-type.js';

export class CreateService {
  public constructor(
    private readonly serviceRepository: ServiceRepository,
    private readonly clientRepository: ClientRepository,
    private readonly companyContext: CompanyContext,
    private readonly idGenerator: IdGenerator,
    private readonly clock: Clock,
    private readonly outbox: ServiceOutboxPort = { append: () => Promise.resolve() },
    private readonly unitOfWork: ServiceUnitOfWork = { execute: (work) => work() },
  ) {}

  public async execute(input: CreateServiceInput): Promise<CreateServiceResult> {
    const companyId = this.companyContext.getCompanyId();
    const clientId = ClientReferenceId.create(input.clientId);
    const client = await this.clientRepository.findById(companyId, clientId.value);

    if (client === null) {
      throw new ClientNotFoundError();
    }

    if (client.status === 'archived') {
      throw new ClientCannotReceiveServiceError();
    }

    const now = this.clock.now();
    const service = Service.create({
      billingDay: BillingDay.create(input.billingDay),
      causationId: input.causationId,
      clientId,
      companyId,
      correlationId: input.correlationId,
      createdAt: now,
      eventId: this.idGenerator.generate(),
      id: ServiceId.create(this.idGenerator.generate()),
      planVersionId: PlanVersionId.create(input.planVersionId),
      serviceType: ServiceType.create(input.serviceType),
    });

    const domainEvents = service.pullDomainEvents();
    await this.unitOfWork.execute(async () => {
      await this.serviceRepository.save(service);
      await this.outbox.append(domainEvents);
    });

    return {
      domainEvents,
      service: toServiceDto(service),
    };
  }
}
