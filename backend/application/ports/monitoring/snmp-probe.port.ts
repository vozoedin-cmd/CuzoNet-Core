import type { SnmpV2cCredentials } from './monitoring-credential-provider.port.js';

export type SnmpProbeErrorType = 'timeout' | 'unreachable' | 'authentication' | 'execution';

export interface SnmpProbeRequest {
  readonly oids: readonly string[];
  readonly subtrees: readonly string[];
}

export interface SnmpProbeValue {
  readonly oid: string;
  readonly value: unknown;
}

export interface SnmpProbeResult {
  readonly errorType?: SnmpProbeErrorType;
  readonly success: boolean;
  readonly values: readonly SnmpProbeValue[];
}

export interface SnmpProbe {
  probe(
    host: string,
    credentials: SnmpV2cCredentials,
    request: SnmpProbeRequest,
  ): Promise<SnmpProbeResult>;
}
