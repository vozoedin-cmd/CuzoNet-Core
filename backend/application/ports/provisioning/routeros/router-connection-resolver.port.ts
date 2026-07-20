export interface RouterConnectionProfile {
  readonly host: string;
  readonly port: number;
  readonly secretReference: string;
  readonly timeoutMs: number;
  readonly tls: boolean;
  readonly username: string;
}

export interface RouterConnectionResolverPort {
  resolve(companyId: string, routerId: string): Promise<RouterConnectionProfile | null>;
}
