import type { RouterOsCredentials } from './routeros-credential-provider.port.js';

export type RouterOsClientErrorType =
  'timeout' | 'authentication' | 'unreachable' | 'tls' | 'execution';

export type RouterOsRecord = Readonly<Record<string, string>>;

export interface RouterOsSnapshot {
  readonly interfaces: readonly RouterOsRecord[];
  readonly systemResources: readonly RouterOsRecord[];
}

export type RouterOsClientResult =
  | {
      readonly success: true;
      readonly snapshot: RouterOsSnapshot;
    }
  | {
      readonly errorType: RouterOsClientErrorType;
      readonly success: false;
    };

export interface RouterOsClient {
  query(credentials: RouterOsCredentials): Promise<RouterOsClientResult>;
}
