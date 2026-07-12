import type {
  BillingServiceSnapshot,
  ServiceBillingReader,
} from '../../../application/ports/billing/service-billing-reader.port.js';
import type { ServiceReader } from '../../../application/ports/services/service-reader.port.js';
export class ServiceBillingReaderAdapter implements ServiceBillingReader {
  public constructor(private readonly services: ServiceReader) {}
  public async findById(
    companyId: string,
    serviceId: string,
  ): Promise<BillingServiceSnapshot | null> {
    const service = await this.services.findById(companyId, serviceId);
    return service === null
      ? null
      : {
          clientId: service.clientId.value,
          companyId: service.companyId,
          lifecycleStatus: service.lifecycleStatus.value,
          serviceId: service.id.value,
        };
  }
}
