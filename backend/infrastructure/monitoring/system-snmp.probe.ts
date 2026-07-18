import { isIP } from 'node:net';

import * as snmp from 'net-snmp';

import type { SnmpV2cCredentials } from '../../application/ports/monitoring/monitoring-credential-provider.port.js';
import type {
  SnmpProbe,
  SnmpProbeErrorType,
  SnmpProbeRequest,
  SnmpProbeResult,
  SnmpProbeValue,
} from '../../application/ports/monitoring/snmp-probe.port.js';
import { ManagementHost } from '../../domain/inventory/management-host.js';

export interface SnmpSessionClient {
  close(): void;
  get(oids: readonly string[]): Promise<readonly SnmpProbeValue[]>;
  subtree(oid: string): Promise<readonly SnmpProbeValue[]>;
}

export interface SnmpSessionFactory {
  create(host: string, credentials: SnmpV2cCredentials): SnmpSessionClient;
}

export interface SystemSnmpProbeOptions {
  sessionFactory?: SnmpSessionFactory;
}

export class SystemSnmpProbe implements SnmpProbe {
  private readonly sessionFactory: SnmpSessionFactory;

  public constructor(options: SystemSnmpProbeOptions = {}) {
    this.sessionFactory = options.sessionFactory ?? netSnmpSessionFactory;
  }

  public async probe(
    host: string,
    credentials: SnmpV2cCredentials,
    request: SnmpProbeRequest,
  ): Promise<SnmpProbeResult> {
    let normalizedHost: string;
    try {
      normalizedHost = ManagementHost.create(host).value;
      assertCredentials(credentials);
      assertRequest(request);
    } catch {
      return failedResult('execution');
    }

    let session: SnmpSessionClient | undefined;
    try {
      session = this.sessionFactory.create(normalizedHost, credentials);
      const values: SnmpProbeValue[] = [];
      if (request.oids.length > 0) {
        values.push(...(await session.get(request.oids)));
      }
      for (const oid of request.subtrees) {
        values.push(...(await session.subtree(oid)));
      }
      return { success: true, values };
    } catch (error) {
      return failedResult(classifySnmpError(error));
    } finally {
      session?.close();
    }
  }
}

export function classifySnmpError(error: unknown): SnmpProbeErrorType {
  if (!(error instanceof Error)) return 'execution';
  const code =
    'code' in error && (typeof error.code === 'string' || typeof error.code === 'number')
      ? error.code
      : undefined;
  const status = 'status' in error && typeof error.status === 'number' ? error.status : undefined;
  const message = error.message.toLowerCase();

  if (
    status === snmp.ErrorStatus.NoAccess ||
    status === snmp.ErrorStatus.AuthorizationError ||
    message.includes('authorization') ||
    message.includes('authentication') ||
    message.includes('bad community')
  ) {
    return 'authentication';
  }
  if (
    error.name === 'RequestTimedOutError' ||
    code === 'ETIMEDOUT' ||
    message.includes('timed out') ||
    message.includes('timeout')
  ) {
    return 'timeout';
  }
  if (
    code === 'EHOSTUNREACH' ||
    code === 'ENETUNREACH' ||
    code === 'ENETDOWN' ||
    message.includes('host unreachable') ||
    message.includes('network is unreachable')
  ) {
    return 'unreachable';
  }
  return 'execution';
}

const netSnmpSessionFactory: SnmpSessionFactory = {
  create(host, credentials) {
    const session = snmp.createSession(host, credentials.community, {
      transport: isIP(host) === 6 ? 'udp6' : 'udp4',
      retries: credentials.retries,
      timeout: credentials.timeoutMs,
      version: snmp.Version2c,
    });
    return new NetSnmpSessionClient(session);
  },
};

class NetSnmpSessionClient implements SnmpSessionClient {
  public constructor(private readonly session: snmp.Session) {}

  public close(): void {
    this.session.close();
  }

  public get(oids: readonly string[]): Promise<readonly SnmpProbeValue[]> {
    return new Promise((resolve, reject) => {
      this.session.get([...oids], (error, varbinds) => {
        if (error !== null) {
          reject(error);
          return;
        }
        try {
          resolve(toProbeValues(varbinds ?? []));
        } catch (varbindError) {
          reject(varbindError);
        }
      });
    });
  }

  public subtree(oid: string): Promise<readonly SnmpProbeValue[]> {
    return new Promise((resolve, reject) => {
      const values: SnmpProbeValue[] = [];
      let feedError: unknown;
      this.session.subtree(
        oid,
        (varbinds) => {
          if (feedError !== undefined) return true;
          try {
            values.push(...toProbeValues(varbinds));
          } catch (error) {
            feedError = error;
            return true;
          }
        },
        (error) => {
          if (feedError !== undefined) {
            reject(feedError);
            return;
          }
          if (error === null) resolve(values);
          else reject(error);
        },
      );
    });
  }
}

function toProbeValues(varbinds: readonly snmp.Varbind[]): SnmpProbeValue[] {
  return varbinds.flatMap((varbind) => {
    if (snmp.isVarbindError(varbind)) {
      if (
        varbind.type === snmp.ObjectType.NoSuchObject ||
        varbind.type === snmp.ObjectType.NoSuchInstance ||
        varbind.type === snmp.ObjectType.EndOfMibView
      ) {
        return [];
      }
      throw new Error(`SNMP varbind error for OID ${varbind.oid}: ${snmp.varbindError(varbind)}`);
    }
    return [{ oid: varbind.oid, value: varbind.value }];
  });
}

function assertCredentials(credentials: SnmpV2cCredentials): void {
  if (
    credentials.version !== '2c' ||
    credentials.community.trim().length === 0 ||
    !Number.isInteger(credentials.timeoutMs) ||
    credentials.timeoutMs < 1 ||
    !Number.isInteger(credentials.retries) ||
    credentials.retries < 0
  ) {
    throw new Error('Invalid SNMP v2c credentials.');
  }
}

function assertRequest(request: SnmpProbeRequest): void {
  const oids = [...request.oids, ...request.subtrees];
  if (oids.length === 0 || oids.some((oid) => !isOid(oid))) {
    throw new Error('Invalid SNMP request.');
  }
}

function isOid(value: string): boolean {
  return /^(?:0|[1-9]\d*)(?:\.(?:0|[1-9]\d*))*$/.test(value);
}

function failedResult(errorType: SnmpProbeErrorType): SnmpProbeResult {
  return { errorType, success: false, values: [] };
}
