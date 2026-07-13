import type {
  ServiceAutomationFacts,
  ServiceAutomationReader,
} from '../../../application/ports/automation/service-automation-reader.port.js';
import type { ServiceReader } from '../../../application/ports/services/service-reader.port.js';
export class ServiceAutomationReaderAdapter implements ServiceAutomationReader {
  public constructor(private readonly services: ServiceReader) {}
  public async findFacts(
    companyId: string,
    serviceId: string,
  ): Promise<ServiceAutomationFacts | null> {
    const service = await this.services.findById(companyId, serviceId);
    return service === null
      ? null
      : { lifecycleStatus: service.lifecycleStatus.value, serviceId: service.id.value };
  }
}
