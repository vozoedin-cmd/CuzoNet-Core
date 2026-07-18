import { describe, expect, it } from 'vitest';

import { EquipmentState } from '../../../../backend/domain/monitoring/equipment-state.js';
import { Observation } from '../../../../backend/domain/monitoring/observation.js';

const occurredAt = new Date('2026-07-18T12:00:00.000Z');

describe('EquipmentState ICMP policy', () => {
  it('proyecta UP con latencia y pérdida cero', () => {
    const state = createState('UNKNOWN');

    state.applyObservations([latency(10), packetLoss(0)]);

    expect(state.props).toMatchObject({
      lastLatencyMs: 10,
      lastSeenAt: occurredAt,
      status: 'UP',
    });
  });

  it('proyecta DOWN con pérdida total sin latencia', () => {
    const state = createState('UNKNOWN');

    state.applyObservations([packetLoss(100)]);

    expect(state.props.status).toBe('DOWN');
  });

  it('proyecta DEGRADED con pérdida parcial', () => {
    const state = createState('UP');

    state.applyObservations([latency(15), packetLoss(25)]);

    expect(state.props.status).toBe('DEGRADED');
  });


  it('mantiene UP con p?rdida dentro del umbral existente', () => {
    const state = createState('UNKNOWN');

    state.applyObservations([latency(15), packetLoss(20)]);

    expect(state.props.status).toBe('UP');
  });
  it('permite recuperar un equipo DOWN a UP', () => {
    const state = createState('DOWN');

    state.applyObservations([latency(7), packetLoss(0)]);

    expect(state.props.status).toBe('UP');
  });

  it('mantiene UNKNOWN ante métricas sin señal de disponibilidad', () => {
    const state = createState('UNKNOWN');

    state.applyObservations([
      Observation.create({
        equipmentId: 'equipment-1',
        id: 'uptime-1',
        metricType: 'uptime',
        occurredAt,
        source: 'test',
        unit: 'seconds',
        value: 100,
      }),
    ]);

    expect(state.props.status).toBe('UNKNOWN');
  });

  it('preserva MAINTENANCE ante pérdida total', () => {
    const state = createState('MAINTENANCE');

    state.applyObservations([packetLoss(100)]);

    expect(state.props.status).toBe('MAINTENANCE');
  });
});

function createState(
  status: 'UP' | 'DOWN' | 'DEGRADED' | 'UNKNOWN' | 'MAINTENANCE',
): EquipmentState {
  return EquipmentState.create({ equipmentId: 'equipment-1', status });
}

function latency(value: number): Observation {
  return Observation.create({
    equipmentId: 'equipment-1',
    id: `latency-${value}`,
    metricType: 'ping_latency',
    occurredAt,
    source: 'icmp-ping',
    unit: 'ms',
    value,
  });
}

function packetLoss(value: number): Observation {
  return Observation.create({
    equipmentId: 'equipment-1',
    id: `packet-loss-${value}`,
    metricType: 'packet_loss',
    occurredAt,
    source: 'icmp-ping',
    unit: 'percent',
    value,
  });
}
