import { RouterOSClient as LibraryRouterOsClient } from '@sourceregistry/mikrotik-client/routeros';

import type {
  RouterOsClient,
  RouterOsClientErrorType,
  RouterOsClientResult,
  RouterOsRecord,
} from '../../application/ports/monitoring/routeros-client.port.js';
import type { RouterOsCredentials } from '../../application/ports/monitoring/routeros-credential-provider.port.js';
import { ManagementHost } from '../../domain/inventory/management-host.js';

export type RouterOsLibraryAttributes = Readonly<Record<string, string | readonly string[]>>;

export interface RouterOsLibraryClient {
  close(): Promise<void>;
  connect(): Promise<void>;
  print(
    command: string,
    options: {
      attributes: RouterOsLibraryAttributes;
      timeoutMs: number;
    },
  ): Promise<readonly RouterOsRecord[]>;
}

export interface RouterOsLibraryClientFactory {
  create(credentials: RouterOsCredentials): RouterOsLibraryClient;
}

export interface SystemRouterOsClientOptions {
  factory?: RouterOsLibraryClientFactory;
}

export class SystemRouterOsClient implements RouterOsClient {
  private readonly factory: RouterOsLibraryClientFactory;

  public constructor(options: SystemRouterOsClientOptions = {}) {
    this.factory = options.factory ?? libraryClientFactory;
  }

  public async query(credentials: RouterOsCredentials): Promise<RouterOsClientResult> {
    try {
      validateCredentials(credentials);
    } catch {
      return { errorType: 'execution', success: false };
    }

    let client: RouterOsLibraryClient | undefined;
    try {
      client = this.factory.create(credentials);
      await client.connect();
      const systemResources = await client.print('/system/resource/print', {
        attributes: {
          '.proplist': ['cpu-load', 'free-memory', 'total-memory', 'uptime'],
        },
        timeoutMs: credentials.timeoutMs,
      });
      const interfaces = await client.print('/interface/print', {
        attributes: {
          '.proplist': ['.id', 'name', 'running', 'disabled', 'rx-byte', 'tx-byte'],
          stats: '',
        },
        timeoutMs: credentials.timeoutMs,
      });
      return {
        snapshot: { interfaces, systemResources },
        success: true,
      };
    } catch (error) {
      return { errorType: classifyRouterOsError(error), success: false };
    } finally {
      await safelyClose(client);
    }
  }
}

export function classifyRouterOsError(error: unknown): RouterOsClientErrorType {
  if (!(error instanceof Error)) return 'execution';
  const code = 'code' in error && typeof error.code === 'string' ? error.code : undefined;
  const normalized = error.message.toLowerCase();
  if (
    code === 'auth_failed' ||
    code === 'permission_denied' ||
    normalized.includes('authentication') ||
    normalized.includes('invalid user') ||
    normalized.includes('not logged in')
  ) {
    return 'authentication';
  }
  if (
    code === 'connection_timeout' ||
    code === 'ETIMEDOUT' ||
    normalized.includes('timed out') ||
    normalized.includes('timeout')
  ) {
    return 'timeout';
  }
  if (
    code === 'connection_refused' ||
    code === 'ECONNREFUSED' ||
    code === 'EHOSTUNREACH' ||
    code === 'ENETUNREACH' ||
    normalized.includes('connection refused') ||
    normalized.includes('host unreachable')
  ) {
    return 'unreachable';
  }
  if (code === 'tls_failed' || normalized.includes('certificate') || normalized.includes('tls')) {
    return 'tls';
  }
  return 'execution';
}

const libraryClientFactory: RouterOsLibraryClientFactory = {
  create(credentials) {
    const client = new LibraryRouterOsClient({
      host: credentials.host,
      password: credentials.password,
      port: credentials.port,
      timeoutMs: credentials.timeoutMs,
      tls: credentials.tls,
      username: credentials.username,
    });
    return {
      close: () => client.close(),
      connect: async () => {
        await client.connect();
      },
      print: (command, options) =>
        client.print(command, {
          attributes: options.attributes,
          timeoutMs: options.timeoutMs,
        }),
    };
  },
};

function validateCredentials(credentials: RouterOsCredentials): void {
  ManagementHost.create(credentials.host);
  if (
    credentials.username.trim().length === 0 ||
    !Number.isInteger(credentials.port) ||
    credentials.port < 1 ||
    credentials.port > 65_535 ||
    !Number.isInteger(credentials.timeoutMs) ||
    credentials.timeoutMs < 1
  ) {
    throw new Error('Credenciales RouterOS inválidas.');
  }
}

async function safelyClose(client: RouterOsLibraryClient | undefined): Promise<void> {
  try {
    await client?.close();
  } catch {
    // Closing must not replace the result of the monitoring query.
  }
}
