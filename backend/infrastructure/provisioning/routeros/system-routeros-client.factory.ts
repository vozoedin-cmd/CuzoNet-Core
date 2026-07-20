import type { RouterConnectionProfile } from '../../../application/ports/provisioning/routeros/router-connection-resolver.port.js';
import type {
  RouterOsClientFactoryPort,
  RouterOsClientPort,
} from '../../../application/ports/provisioning/routeros/routeros-client.port.js';
import { environment } from '../../config/environment.js';
import { LibraryRouterOsSimpleQueueClient } from './library-routeros-simple-queue.client.js';

export class SystemRouterOsClientFactory implements RouterOsClientFactoryPort {
  public async create(
    profile: RouterConnectionProfile,
    secret: string,
  ): Promise<RouterOsClientPort> {
    if (!environment.ROUTEROS_PROVISIONING_ENABLED) {
      throw new Error('ROUTEROS_PROVISIONING_DISABLED');
    }
    return LibraryRouterOsSimpleQueueClient.connect(profile, secret);
  }
}
