import {
  type ListClientServicesInput,
  type ServiceDto,
  toServiceDto,
} from '../../../dto/services/service.dto.js';
import type { CompanyContext } from '../../../ports/company-context.port.js';
import type { ServiceReader } from '../../../ports/services/service-reader.port.js';
import { ClientReferenceId } from '../../../../domain/services/value-objects/client-reference-id.js';

export class ListClientServices {
  public constructor(
    private readonly serviceReader: ServiceReader,
    private readonly companyContext: CompanyContext,
  ) {}

  public async execute(input: ListClientServicesInput): Promise<readonly ServiceDto[]> {
    const clientId = ClientReferenceId.create(input.clientId);
    const services = await this.serviceReader.listByClient(
      this.companyContext.getCompanyId(),
      clientId.value,
    );

    return services.map(toServiceDto);
  }
}
