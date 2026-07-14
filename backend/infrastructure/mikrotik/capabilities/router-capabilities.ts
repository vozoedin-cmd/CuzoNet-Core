import type { RouterOsApiSession } from '../api-ssl/router-os-api.contracts.js';

export class UnsupportedRouterOsVersionError extends Error {
  public constructor(
    public readonly actualVersion: string,
    public readonly minimumVersion: string,
  ) {
    super(`RouterOS ${actualVersion} no cumple la version minima ${minimumVersion}.`);
    this.name = 'UnsupportedRouterOsVersionError';
  }
}

export class RouterCapabilities {
  public static readonly minimumApiSslVersion = '6.43.0';

  private constructor(public readonly version: string) {}

  public static fromVersion(
    version: string,
    minimumVersion = RouterCapabilities.minimumApiSslVersion,
  ): RouterCapabilities {
    if (compareVersions(version, minimumVersion) < 0) {
      throw new UnsupportedRouterOsVersionError(version, minimumVersion);
    }
    return new RouterCapabilities(version);
  }

  public static async inspect(
    session: RouterOsApiSession,
    signal?: AbortSignal,
    minimumVersion = RouterCapabilities.minimumApiSslVersion,
  ): Promise<RouterCapabilities> {
    const replies = await session.execute(
      {
        arguments: { '.proplist': 'version' },
        path: '/system/resource/print',
      },
      signal,
    );
    const version = replies.find((reply) => reply.type === '!re')?.attributes.version;
    if (version === undefined || version.trim() === '') {
      throw new UnsupportedRouterOsVersionError('unknown', minimumVersion);
    }
    return RouterCapabilities.fromVersion(version, minimumVersion);
  }
}

function compareVersions(left: string, right: string): number {
  const leftParts = parseVersion(left);
  const rightParts = parseVersion(right);
  for (let index = 0; index < 3; index += 1) {
    const difference = leftParts[index]! - rightParts[index]!;
    if (difference !== 0) return difference;
  }
  return 0;
}

function parseVersion(version: string): readonly [number, number, number] {
  const match = /^(\d+)\.(\d+)(?:\.(\d+))?/.exec(version.trim());
  if (match === null) return [0, 0, 0];
  return [Number(match[1]), Number(match[2]), Number(match[3] ?? 0)];
}
