import type {
  ServiceProvisioningReader,
  ProvisioningServiceSnapshot,
} from '../../../application/ports/provisioning/service-provisioning-reader.port.js';
import type { ServiceReader } from '../../../application/ports/services/service-reader.port.js';

export class ServiceReaderProvisioningAdapter implements ServiceProvisioningReader {
  public constructor(private readonly serviceReader: ServiceReader) {}
  public async findById(
    companyId: string,
    serviceId: string,
  ): Promise<ProvisioningServiceSnapshot | null> {
    const service = await this.serviceReader.findById(companyId, serviceId);
    if (service === null) return null;
    return {
      companyId: service.companyId,
      lifecycleStatus: service.lifecycleStatus.value,
      planVersionId: service.planVersionId.value,
      serviceId: service.id.value,
      serviceType: service.serviceType.value,
    };
  }
}
