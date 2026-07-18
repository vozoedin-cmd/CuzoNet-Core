import { describe, expect, it, vi } from 'vitest';

import type { InventoryEquipmentReference } from '../../../../backend/application/ports/monitoring/inventory.reader.js';
import type { PingProbe } from '../../../../backend/application/ports/monitoring/ping-probe.port.js';
import { CollectorRegistry } from '../../../../backend/infrastructure/monitoring/collector-registry.js';
import { InventoryMonitoringTargetResolver } from '../../../../backend/infrastructure/monitoring/inventory-monitoring-target-resolver.js';
import { NoOpCollector } from '../../../../backend/infrastructure/monitoring/no-op.collector.js';
import { PingCollector } from '../../../../backend/infrastructure/monitoring/ping.collector.js';

const occurredAt = new Date('2026-07-18T12:00:00.000Z');

describe('PingCollector', () => {
  it('produce ping_latency y packet_loss=0 cuando el probe responde', async () => {
    const probe: PingProbe = {
      probe: vi.fn().mockResolvedValue({
        latencyMs: 8.25,
        packetLossPercent: 0,
        reachable: true,
      }),
    };
    const collector = createCollector(probe);
    const item = equipment({ id: 'router-1', managementHost: 'router.example.com' });

    const observations = await collector.collect(item);

    expect(probe.probe).toHaveBeenCalledWith('router.example.com', {
      timeoutMs: 2_000,
    });
    expect(observations.map((observation) => observation.props)).toEqual([
      expect.objectContaining({
        equipmentId: 'router-1',
        metricType: 'ping_latency',
        occurredAt,
        source: 'icmp-ping',
        metricValue: expect.objectContaining({ unit: 'ms', value: 8.25 }),
      }),
      expect.objectContaining({
        equipmentId: 'router-1',
        metricType: 'packet_loss',
        occurredAt,
        source: 'icmp-ping',
        metricValue: expect.objectContaining({ unit: 'percent', value: 0 }),
      }),
    ]);
  });

  it('produce sólo packet_loss=100 cuando el probe falla', async () => {
    const collector = createCollector({
      probe: vi.fn().mockResolvedValue({
        errorType: 'timeout',
        packetLossPercent: 100,
        reachable: false,
      }),
    });

    const observations = await collector.collect(
      equipment({ id: 'router-2', managementHost: '192.0.2.20' }),
    );

    expect(observations).toHaveLength(1);
    expect(observations[0]?.props).toMatchObject({
      equipmentId: 'router-2',
      metricType: 'packet_loss',
      occurredAt,
      source: 'icmp-ping',
      metricValue: expect.objectContaining({ unit: 'percent', value: 100 }),
    });
  });

  it('no ejecuta el probe cuando no existe destino', async () => {
    const probe: PingProbe = {
      probe: vi.fn(),
    };
    const collector = createCollector(probe);
    const item = equipment();

    expect(collector.supports(item)).toBe(false);
    await expect(collector.collect(item)).resolves.toEqual([]);
    expect(probe.probe).not.toHaveBeenCalled();
  });

  it('sólo soporta equipos activos con destino contractual', () => {
    const collector = createCollector({ probe: vi.fn() });

    expect(collector.supports(equipment({ managementHost: '192.0.2.1' }))).toBe(true);
    expect(collector.supports(equipment({ managementHost: '192.0.2.1', status: 'inactive' }))).toBe(
      false,
    );
    expect(collector.supports(equipment({ managementHost: '192.0.2.1', status: 'retired' }))).toBe(
      false,
    );
  });

  it('queda antes de NoOpCollector en el registro', () => {
    const pingCollector = createCollector({ probe: vi.fn() });
    const noOp = new NoOpCollector();
    const registry = new CollectorRegistry([pingCollector, noOp]);

    expect(registry.findFor(equipment({ managementHost: 'router.example.com' }))).toBe(
      pingCollector,
    );
    expect(registry.findFor(equipment())).toBe(noOp);
  });
});

function createCollector(probe: PingProbe): PingCollector {
  let sequence = 0;
  return new PingCollector(
    {
      idGenerator: { generate: () => `observation-${++sequence}` },
      probe,
      targetResolver: new InventoryMonitoringTargetResolver(),
    },
    { clock: { now: () => occurredAt }, timeoutMs: 2_000 },
  );
}

function equipment(
  overrides: Partial<InventoryEquipmentReference> = {},
): InventoryEquipmentReference {
  return {
    capabilities: {},
    companyId: 'company-1',
    id: 'equipment-1',
    role: 'core',
    status: 'active',
    type: 'router',
    ...overrides,
  };
}
