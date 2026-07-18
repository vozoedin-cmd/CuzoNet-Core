import type { Clock } from '../../application/ports/clock.port.js';
import type { IdGenerator } from '../../application/ports/id-generator.port.js';
import type { InventoryEquipmentReference } from '../../application/ports/monitoring/inventory.reader.js';
import type { MonitoringCollector } from '../../application/ports/monitoring/monitoring-collector.port.js';
import type { MonitoringTargetResolver } from '../../application/ports/monitoring/monitoring-target-resolver.port.js';
import type { PingProbe } from '../../application/ports/monitoring/ping-probe.port.js';
import { Observation } from '../../domain/monitoring/observation.js';

const source = 'icmp-ping';
const defaultClock: Clock = { now: () => new Date() };

export interface PingCollectorDependencies {
  idGenerator: IdGenerator;
  probe: PingProbe;
  targetResolver: MonitoringTargetResolver;
}

export interface PingCollectorOptions {
  clock?: Clock;
  timeoutMs: number;
}

export class PingCollector implements MonitoringCollector {
  private readonly clock: Clock;
  private readonly timeoutMs: number;

  public constructor(
    private readonly dependencies: PingCollectorDependencies,
    options: PingCollectorOptions,
  ) {
    if (!Number.isInteger(options.timeoutMs) || options.timeoutMs < 1) {
      throw new RangeError('timeoutMs debe ser un entero mayor que cero.');
    }
    this.clock = options.clock ?? defaultClock;
    this.timeoutMs = options.timeoutMs;
  }

  public supports(equipment: InventoryEquipmentReference): boolean {
    return (
      equipment.status === 'active' && this.dependencies.targetResolver.resolve(equipment) !== null
    );
  }

  public async collect(equipment: InventoryEquipmentReference): Promise<Observation[]> {
    const target = this.dependencies.targetResolver.resolve(equipment);
    if (target === null) return [];

    const result = await this.dependencies.probe.probe(target.host, {
      timeoutMs: this.timeoutMs,
    });
    const occurredAt = this.clock.now();
    if (!result.reachable) {
      return [this.observation(equipment.id, 'packet_loss', 100, 'percent', occurredAt)];
    }
    if (
      result.latencyMs === undefined ||
      !Number.isFinite(result.latencyMs) ||
      result.latencyMs < 0
    ) {
      throw new Error('PingProbe devolvió reachable sin un RTT válido.');
    }

    return [
      this.observation(equipment.id, 'ping_latency', result.latencyMs, 'ms', occurredAt),
      this.observation(equipment.id, 'packet_loss', 0, 'percent', occurredAt),
    ];
  }

  private observation(
    equipmentId: string,
    metricType: string,
    value: number,
    unit: 'ms' | 'percent',
    occurredAt: Date,
  ): Observation {
    return Observation.create({
      equipmentId,
      id: this.dependencies.idGenerator.generate(),
      metricType,
      occurredAt,
      source,
      unit,
      value,
    });
  }
}
