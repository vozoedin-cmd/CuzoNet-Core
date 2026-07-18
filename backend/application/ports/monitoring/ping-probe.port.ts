export type PingProbeErrorType = 'timeout' | 'dns' | 'unreachable' | 'execution';

export interface PingProbeOptions {
  timeoutMs: number;
}

export interface PingProbeResult {
  reachable: boolean;
  latencyMs?: number;
  packetLossPercent: number;
  errorType?: PingProbeErrorType;
}

export interface PingProbe {
  probe(host: string, options: PingProbeOptions): Promise<PingProbeResult>;
}
