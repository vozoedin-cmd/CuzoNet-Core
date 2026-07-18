import type { Clock } from '../../application/ports/clock.port.js';
import type { IdGenerator } from '../../application/ports/id-generator.port.js';
import type { InventoryEquipmentReference } from '../../application/ports/monitoring/inventory.reader.js';
import type { MonitoringCollector } from '../../application/ports/monitoring/monitoring-collector.port.js';
import type { MonitoringCredentialProvider } from '../../application/ports/monitoring/monitoring-credential-provider.port.js';
import type { MonitoringTargetResolver } from '../../application/ports/monitoring/monitoring-target-resolver.port.js';
import type { SnmpProbe } from '../../application/ports/monitoring/snmp-probe.port.js';
import { Observation } from '../../domain/monitoring/observation.js';
import type { MetricUnit } from '../../domain/monitoring/metric-value.js';
import {
  parseStandardSnmpMetrics,
  standardSnmpRequest,
  type StandardSnmpMetrics,
} from './standard-snmp-metrics.js';

const source = 'snmp';
const defaultClock: Clock = { now: () => new Date() };

export interface SnmpCollectorDependencies {
  credentialProvider: MonitoringCredentialProvider;
  idGenerator: IdGenerator;
  probe: SnmpProbe;
  targetResolver: MonitoringTargetResolver;
}

export interface SnmpCollectorOptions {
  clock?: Clock;
}

interface MetricDefinition {
  key: keyof StandardSnmpMetrics;
  metricType: string;
  unit: MetricUnit;
}

const metricDefinitions: readonly MetricDefinition[] = [
  { key: 'cpuUsage', metricType: 'cpu_usage', unit: 'percent' },
  { key: 'memoryUsed', metricType: 'memory_used', unit: 'bytes' },
  { key: 'memoryTotal', metricType: 'memory_total', unit: 'bytes' },
  { key: 'uptime', metricType: 'uptime', unit: 'seconds' },
  { key: 'interfacesUp', metricType: 'interfaces_up', unit: 'count' },
  { key: 'interfacesDown', metricType: 'interfaces_down', unit: 'count' },
];

export class SnmpCollector implements MonitoringCollector {
  private readonly clock: Clock;

  public constructor(
    private readonly dependencies: SnmpCollectorDependencies,
    options: SnmpCollectorOptions = {},
  ) {
    this.clock = options.clock ?? defaultClock;
  }

  public supports(equipment: InventoryEquipmentReference): boolean {
    return (
      equipment.status === 'active' && this.dependencies.targetResolver.resolve(equipment) !== null
    );
  }

  public async collect(equipment: InventoryEquipmentReference): Promise<Observation[]> {
    const target = this.dependencies.targetResolver.resolve(equipment);
    if (target === null) return [];
    const credentials = await this.dependencies.credentialProvider.getSnmpV2cCredentials(equipment);
    if (credentials === null) return [];

    const result = await this.dependencies.probe.probe(
      target.host,
      credentials,
      standardSnmpRequest,
    );
    if (!result.success) {
      throw new Error(`SNMP probe failed: ${result.errorType ?? 'execution'}`);
    }

    const metrics = parseStandardSnmpMetrics(result.values);
    const occurredAt = this.clock.now();
    return metricDefinitions.flatMap((definition) => {
      const value = metrics[definition.key];
      return value === undefined
        ? []
        : [
            Observation.create({
              equipmentId: equipment.id,
              id: this.dependencies.idGenerator.generate(),
              metricType: definition.metricType,
              occurredAt,
              source,
              unit: definition.unit,
              value,
            }),
          ];
    });
  }
}
