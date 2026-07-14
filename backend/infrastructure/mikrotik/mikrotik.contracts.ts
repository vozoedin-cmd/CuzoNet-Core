import type { RouterOsConnection } from './api-ssl/router-os-api.contracts.js';

export interface MikrotikRouterProvider {
  findConnection(companyId: string, routerId: string): Promise<RouterOsConnection | null>;
}

export interface SimpleQueueTargetResolver {
  resolve(input: {
    companyId: string;
    ipAddressId: string | undefined;
    serviceAddressId: string | undefined;
    serviceId: string;
  }): Promise<string | null>;
}
