import type {
  SnmpProbeRequest,
  SnmpProbeValue,
} from '../../application/ports/monitoring/snmp-probe.port.js';

export const standardSnmpOids = Object.freeze({
  hrProcessorLoad: '1.3.6.1.2.1.25.3.3.1.2',
  hrStorageAllocationUnits: '1.3.6.1.2.1.25.2.3.1.4',
  hrStorageRam: '1.3.6.1.2.1.25.2.1.2',
  hrStorageSize: '1.3.6.1.2.1.25.2.3.1.5',
  hrStorageType: '1.3.6.1.2.1.25.2.3.1.2',
  hrStorageUsed: '1.3.6.1.2.1.25.2.3.1.6',
  ifOperStatus: '1.3.6.1.2.1.2.2.1.8',
  sysUpTime: '1.3.6.1.2.1.1.3.0',
});

export const standardSnmpRequest: SnmpProbeRequest = Object.freeze({
  oids: Object.freeze([standardSnmpOids.sysUpTime]),
  subtrees: Object.freeze([
    standardSnmpOids.hrProcessorLoad,
    standardSnmpOids.hrStorageType,
    standardSnmpOids.hrStorageAllocationUnits,
    standardSnmpOids.hrStorageSize,
    standardSnmpOids.hrStorageUsed,
    standardSnmpOids.ifOperStatus,
  ]),
});

export interface StandardSnmpMetrics {
  cpuUsage?: number;
  interfacesDown?: number;
  interfacesUp?: number;
  memoryTotal?: number;
  memoryUsed?: number;
  uptime?: number;
}

export function parseStandardSnmpMetrics(values: readonly SnmpProbeValue[]): StandardSnmpMetrics {
  return {
    ...parseUptime(values),
    ...parseCpu(values),
    ...parseMemory(values),
    ...parseInterfaces(values),
  };
}

function parseUptime(values: readonly SnmpProbeValue[]): Pick<StandardSnmpMetrics, 'uptime'> {
  const ticks = numericValue(
    values.find((value) => normalizeOid(value.oid) === standardSnmpOids.sysUpTime)?.value,
  );
  return ticks === undefined || ticks < 0 ? {} : { uptime: Math.floor(ticks / 100) };
}

function parseCpu(values: readonly SnmpProbeValue[]): Pick<StandardSnmpMetrics, 'cpuUsage'> {
  const loads = values
    .filter((value) => belongsToSubtree(value.oid, standardSnmpOids.hrProcessorLoad))
    .map((value) => numericValue(value.value))
    .filter((value): value is number => value !== undefined && value >= 0 && value <= 100);
  if (loads.length === 0) return {};
  return { cpuUsage: loads.reduce((total, value) => total + value, 0) / loads.length };
}

function parseMemory(
  values: readonly SnmpProbeValue[],
): Pick<StandardSnmpMetrics, 'memoryTotal' | 'memoryUsed'> {
  const types = indexedValues(values, standardSnmpOids.hrStorageType);
  const units = indexedValues(values, standardSnmpOids.hrStorageAllocationUnits);
  const sizes = indexedValues(values, standardSnmpOids.hrStorageSize);
  const used = indexedValues(values, standardSnmpOids.hrStorageUsed);
  let memoryTotal = 0;
  let memoryUsed = 0;
  let completeRows = 0;

  for (const [index, type] of types) {
    if (oidValue(type) !== standardSnmpOids.hrStorageRam) continue;
    const allocationUnits = numericValue(units.get(index));
    const size = numericValue(sizes.get(index));
    const usedUnits = numericValue(used.get(index));
    if (
      allocationUnits === undefined ||
      size === undefined ||
      usedUnits === undefined ||
      allocationUnits < 0 ||
      size < 0 ||
      usedUnits < 0
    ) {
      continue;
    }
    memoryTotal += allocationUnits * size;
    memoryUsed += allocationUnits * usedUnits;
    completeRows += 1;
  }

  return completeRows === 0
    ? {}
    : { memoryTotal: Math.floor(memoryTotal), memoryUsed: Math.floor(memoryUsed) };
}

function parseInterfaces(
  values: readonly SnmpProbeValue[],
): Pick<StandardSnmpMetrics, 'interfacesDown' | 'interfacesUp'> {
  const statuses = values
    .filter((value) => belongsToSubtree(value.oid, standardSnmpOids.ifOperStatus))
    .map((value) => numericValue(value.value))
    .filter((value): value is number => value !== undefined);
  if (statuses.length === 0) return {};
  return {
    interfacesDown: statuses.filter((status) => status === 2).length,
    interfacesUp: statuses.filter((status) => status === 1).length,
  };
}

function indexedValues(values: readonly SnmpProbeValue[], baseOid: string): Map<string, unknown> {
  const indexed = new Map<string, unknown>();
  for (const value of values) {
    const index = subtreeIndex(value.oid, baseOid);
    if (index !== null) indexed.set(index, value.value);
  }
  return indexed;
}

function subtreeIndex(oid: string, baseOid: string): string | null {
  const normalized = normalizeOid(oid);
  const prefix = `${baseOid}.`;
  return normalized.startsWith(prefix) ? normalized.slice(prefix.length) : null;
}

function belongsToSubtree(oid: string, baseOid: string): boolean {
  return subtreeIndex(oid, baseOid) !== null;
}

function normalizeOid(oid: string): string {
  return oid.startsWith('.') ? oid.slice(1) : oid;
}

function numericValue(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value === 'bigint') {
    const converted = Number(value);
    return Number.isSafeInteger(converted) ? converted : undefined;
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const converted = Number(value);
    return Number.isFinite(converted) ? converted : undefined;
  }
  return undefined;
}

function oidValue(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  return normalizeOid(value.trim());
}
