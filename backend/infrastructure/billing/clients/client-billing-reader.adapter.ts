import type {
  BillingClientSnapshot,
  ClientBillingReader,
} from '../../../application/ports/billing/client-billing-reader.port.js';
import type { ClientRepository } from '../../../application/ports/clients/client-repository.port.js';
export class ClientBillingReaderAdapter implements ClientBillingReader {
  public constructor(private readonly clients: ClientRepository) {}
  public async findById(
    companyId: string,
    clientId: string,
  ): Promise<BillingClientSnapshot | null> {
    const client = await this.clients.findById(companyId, clientId);
    return client === null
      ? null
      : { clientId: client.id.value, companyId: client.companyId, status: client.status };
  }
}
