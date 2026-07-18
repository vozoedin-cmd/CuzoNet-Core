import type {
  RouterOsRecord,
  RouterOsSnapshot,
} from '../../application/ports/monitoring/routeros-client.port.js';

export interface RouterOsInterfaceCounters {
  readonly rxBytes: number;
  readonly txBytes: number;
}

export interface RouterOsParsedSnapshot {
  readonly counters: ReadonlyMap<string, RouterOsInterfaceCounters>;
  readonly metrics: RouterOsMetrics;
}

export interface RouterOsMetrics {
  cpuUsage?: number;
  interfacesDown?: number;
  interfacesUp?: number;
  memoryTotal?: number;
  memoryUsed?: number;
  uptime?: number;
}

export function parseRouterOsSnapshot(snapshot: RouterOsSnapshot): RouterOsParsedSnapshot {
  return {
    counters: parseInterfaceCounters(snapshot.interfaces),
    metrics: {
      ...parseSystemResources(snapshot.systemResources),
      ...parseInterfaceStatuses(snapshot.interfaces),
    },
  };
}

export function parseRouterOsUptime(value: string): number | undefined {
  const normalized = value.trim().toLowerCase();
  const colon = normalized.match(/^(?:(\d+)w)?(?:(\d+)d)?(\d{1,2}):(\d{2}):(\d{2})$/);
  if (colon !== null) {
    return (
      numberGroup(colon[1]) * 604_800 +
      numberGroup(colon[2]) * 86_400 +
      numberGroup(colon[3]) * 3_600 +
      numberGroup(colon[4]) * 60 +
      numberGroup(colon[5])
    );
  }

  const tokens = normalized.match(/^(?:(\d+)w)?(?:(\d+)d)?(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
  if (tokens === null || !tokens.slice(1).some((valuePart) => valuePart !== undefined)) {
    return undefined;
  }
  return (
    numberGroup(tokens[1]) * 604_800 +
    numberGroup(tokens[2]) * 86_400 +
    numberGroup(tokens[3]) * 3_600 +
    numberGroup(tokens[4]) * 60 +
    numberGroup(tokens[5])
  );
}

function parseSystemResources(
  records: readonly RouterOsRecord[],
): Pick<RouterOsMetrics, 'cpuUsage' | 'memoryTotal' | 'memoryUsed' | 'uptime'> {
  const resource = records[0];
  if (resource === undefined) return {};
  const cpuUsage = nonNegativeNumber(resource['cpu-load']);
  const memoryTotal = nonNegativeInteger(resource['total-memory']);
  const freeMemory = nonNegativeInteger(resource['free-memory']);
  const uptime = resource.uptime === undefined ? undefined : parseRouterOsUptime(resource.uptime);
  return {
    ...(cpuUsage === undefined || cpuUsage > 100 ? {} : { cpuUsage }),
    ...(memoryTotal === undefined ? {} : { memoryTotal }),
    ...(memoryTotal === undefined || freeMemory === undefined || freeMemory > memoryTotal
      ? {}
      : { memoryUsed: memoryTotal - freeMemory }),
    ...(uptime === undefined ? {} : { uptime }),
  };
}

function parseInterfaceStatuses(
  records: readonly RouterOsRecord[],
): Pick<RouterOsMetrics, 'interfacesDown' | 'interfacesUp'> {
  if (records.length === 0) return {};
  return {
    interfacesDown: records.filter((record) => record.running !== 'true').length,
    interfacesUp: records.filter((record) => record.running === 'true').length,
  };
}

function parseInterfaceCounters(
  records: readonly RouterOsRecord[],
): ReadonlyMap<string, RouterOsInterfaceCounters> {
  const counters = new Map<string, RouterOsInterfaceCounters>();
  records.forEach((record, index) => {
    const rxBytes = nonNegativeInteger(record['rx-byte']);
    const txBytes = nonNegativeInteger(record['tx-byte']);
    if (rxBytes === undefined || txBytes === undefined) return;
    const key = record.name ?? record['.id'] ?? `index-${index}`;
    counters.set(key, { rxBytes, txBytes });
  });
  return counters;
}

function nonNegativeNumber(value: string | undefined): number | undefined {
  if (value === undefined || value.trim().length === 0) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function nonNegativeInteger(value: string | undefined): number | undefined {
  const parsed = nonNegativeNumber(value);
  return parsed !== undefined && Number.isSafeInteger(parsed) ? parsed : undefined;
}

function numberGroup(value: string | undefined): number {
  return value === undefined ? 0 : Number.parseInt(value, 10);
}
