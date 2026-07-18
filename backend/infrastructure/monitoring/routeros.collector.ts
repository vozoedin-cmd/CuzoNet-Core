import type { Clock } from '../../application/ports/clock.port.js';
import type { IdGenerator } from '../../application/ports/id-generator.port.js';
import type { InventoryEquipmentReference } from '../../application/ports/monitoring/inventory.reader.js';
import type { MonitoringCollector } from '../../application/ports/monitoring/monitoring-collector.port.js';
import type { RouterOsClient } from '../../application/ports/monitoring/routeros-client.port.js';
import type { RouterOsCredentialProvider } from '../../application/ports/monitoring/routeros-credential-provider.port.js';
import type { MetricUnit } from '../../domain/monitoring/metric-value.js';
import { Observation } from '../../domain/monitoring/observation.js';
import { parseRouterOsSnapshot, type RouterOsMetrics } from './routeros-metrics.js';
import { RouterOsRateTracker } from './routeros-rate-tracker.js';

const source = 'routeros-api';
const defaultClock: Clock = { now: () => new Date() };

export interface RouterOsCollectorDependencies {
  client: RouterOsClient;
  credentialProvider: RouterOsCredentialProvider;
  idGenerator: IdGenerator;
  rateTracker?: RouterOsRateTracker;
}

export interface RouterOsCollectorOptions {
  clock?: Clock;
}

interface MetricDefinition {
  key: keyof RouterOsMetrics | 'rxBps' | 'txBps';
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
  { key: 'rxBps', metricType: 'rx_bps', unit: 'bps' },
  { key: 'txBps', metricType: 'tx_bps', unit: 'bps' },
];

export class RouterOsCollector implements MonitoringCollector {
  private readonly clock: Clock;
  private readonly rateTracker: RouterOsRateTracker;

  public constructor(
    private readonly dependencies: RouterOsCollectorDependencies,
    options: RouterOsCollectorOptions = {},
  ) {
    this.clock = options.clock ?? defaultClock;
    this.rateTracker = dependencies.rateTracker ?? new RouterOsRateTracker();
  }

  public supports(equipment: InventoryEquipmentReference): boolean {
    return (
      equipment.status === 'active' && this.dependencies.credentialProvider.supports(equipment)
    );
  }

  public async collect(equipment: InventoryEquipmentReference): Promise<Observation[]> {
    const credentials = await this.dependencies.credentialProvider.getCredentials(equipment);
    if (credentials === null) return [];

    const result = await this.dependencies.client.query(credentials);
    if (!result.success) {
      throw new Error(`RouterOS query failed: ${result.errorType}`);
    }

    const occurredAt = this.clock.now();
    const parsed = parseRouterOsSnapshot(result.snapshot);
    const rates = this.rateTracker.record(equipment.id, occurredAt, parsed.counters);
    const values: Readonly<Partial<Record<MetricDefinition['key'], number>>> = {
      ...parsed.metrics,
      ...rates,
    };
    return metricDefinitions.flatMap((definition) => {
      const value = values[definition.key];
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
