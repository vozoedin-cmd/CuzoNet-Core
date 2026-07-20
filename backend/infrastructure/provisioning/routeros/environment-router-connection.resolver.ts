import type {
  RouterConnectionProfile,
  RouterConnectionResolverPort,
} from '../../../application/ports/provisioning/routeros/router-connection-resolver.port.js';
import { environment } from '../../config/environment.js';

export class EnvironmentRouterConnectionResolver implements RouterConnectionResolverPort {
  public async resolve(_companyId: string, _routerId: string): Promise<RouterConnectionProfile | null> {
    if (!environment.MONITORING_ROUTEROS_HOST) {
      return null;
    }
    
    return {
      host: environment.MONITORING_ROUTEROS_HOST,
      port: environment.MONITORING_ROUTEROS_PORT ?? (environment.MONITORING_ROUTEROS_TLS ? 8729 : 8728),
      secretReference: 'MONITORING_ROUTEROS_PASSWORD',
      timeoutMs: environment.ROUTEROS_CONNECT_TIMEOUT_MS,
      tls: environment.ROUTEROS_TLS_VERIFY,
      username: environment.MONITORING_ROUTEROS_USERNAME ?? 'admin',
    };
  }
}
