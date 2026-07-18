import { describe, expect, it } from 'vitest';

import {
  parseRouterOsSnapshot,
  parseRouterOsUptime,
} from '../../../../backend/infrastructure/monitoring/routeros-metrics.js';
import { RouterOsRateTracker } from '../../../../backend/infrastructure/monitoring/routeros-rate-tracker.js';

describe('RouterOS metric parser', () => {
  it('parsea resource e interface stats contractuales', () => {
    expect(
      parseRouterOsSnapshot({
        interfaces: [
          {
            '.id': '*1',
            name: 'ether1',
            running: 'true',
            'rx-byte': '1000',
            'tx-byte': '2000',
          },
          {
            '.id': '*2',
            name: 'ether2',
            running: 'false',
            'rx-byte': '3000',
            'tx-byte': '4000',
          },
        ],
        systemResources: [
          {
            'cpu-load': '37',
            'free-memory': '1024',
            'total-memory': '4096',
            uptime: '1w2d3h4m5s',
          },
        ],
      }),
    ).toEqual({
      counters: new Map([
        ['ether1', { rxBytes: 1000, txBytes: 2000 }],
        ['ether2', { rxBytes: 3000, txBytes: 4000 }],
      ]),
      metrics: {
        cpuUsage: 37,
        interfacesDown: 1,
        interfacesUp: 1,
        memoryTotal: 4096,
        memoryUsed: 3072,
        uptime: 788_645,
      },
    });
  });

  it.each([
    ['1w2d3h4m5s', 788_645],
    ['2d03:04:05', 183_845],
    ['00:01:30', 90],
    ['5m', 300],
  ])('parsea uptime %s', (value, seconds) => {
    expect(parseRouterOsUptime(value)).toBe(seconds);
  });

  it('omite valores inválidos sin fabricar métricas', () => {
    expect(
      parseRouterOsSnapshot({
        interfaces: [],
        systemResources: [
          {
            'cpu-load': '101',
            'free-memory': '200',
            'total-memory': '100',
            uptime: 'not-uptime',
          },
        ],
      }),
    ).toEqual({ counters: new Map(), metrics: { memoryTotal: 100 } });
  });
});

describe('RouterOsRateTracker', () => {
  it('omite el primer muestreo y calcula bps por delta de bytes', () => {
    const tracker = new RouterOsRateTracker();
    const first = new Map([
      ['ether1', { rxBytes: 1_000, txBytes: 2_000 }],
      ['ether2', { rxBytes: 3_000, txBytes: 5_000 }],
    ]);
    const second = new Map([
      ['ether1', { rxBytes: 2_000, txBytes: 4_000 }],
      ['ether2', { rxBytes: 5_000, txBytes: 8_000 }],
    ]);

    expect(tracker.record('router-1', new Date('2026-07-18T12:00:00Z'), first)).toEqual({});
    expect(tracker.record('router-1', new Date('2026-07-18T12:00:10Z'), second)).toEqual({
      rxBps: 2_400,
      txBps: 4_000,
    });
  });

  it('no genera tasas ficticias después de reset de contadores', () => {
    const tracker = new RouterOsRateTracker();
    tracker.record(
      'router-1',
      new Date('2026-07-18T12:00:00Z'),
      new Map([['ether1', { rxBytes: 1_000, txBytes: 1_000 }]]),
    );

    expect(
      tracker.record(
        'router-1',
        new Date('2026-07-18T12:00:10Z'),
        new Map([['ether1', { rxBytes: 10, txBytes: 20 }]]),
      ),
    ).toEqual({});
  });
});
