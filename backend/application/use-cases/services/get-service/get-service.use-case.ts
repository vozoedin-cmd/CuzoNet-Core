import {
  type GetServiceInput,
  type ServiceDto,
  toServiceDto,
} from '../../../dto/services/service.dto.js';
import type { CompanyContext } from '../../../ports/company-context.port.js';
import type { ServiceReader } from '../../../ports/services/service-reader.port.js';
import { ServiceNotFoundError } from '../../../../domain/services/errors/service-not-found.error.js';
import { ServiceId } from '../../../../domain/services/value-objects/service-id.js';

export class GetService {
  public constructor(
    private readonly serviceReader: ServiceReader,
    private readonly companyContext: CompanyContext,
  ) {}

  public async execute(input: GetServiceInput): Promise<ServiceDto> {
    const serviceId = ServiceId.create(input.serviceId);
    const service = await this.serviceReader.findById(
      this.companyContext.getCompanyId(),
      serviceId.value,
    );

    if (service === null) {
      throw new ServiceNotFoundError();
    }

    return toServiceDto(service);
  }
}
