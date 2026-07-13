import type {
  ClientAutomationFacts,
  ClientAutomationReader,
} from '../../../application/ports/automation/client-automation-reader.port.js';
import type { ClientRepository } from '../../../application/ports/clients/client-repository.port.js';
export class ClientAutomationReaderAdapter implements ClientAutomationReader {
  public constructor(private readonly clients: ClientRepository) {}
  public async findFacts(
    companyId: string,
    clientId: string,
  ): Promise<ClientAutomationFacts | null> {
    const client = await this.clients.findById(companyId, clientId);
    return client === null ? null : { clientId: client.id.value, status: client.status };
  }
}
