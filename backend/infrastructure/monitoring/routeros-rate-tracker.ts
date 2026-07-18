import type { RouterOsInterfaceCounters } from './routeros-metrics.js';

export interface RouterOsRates {
  rxBps?: number;
  txBps?: number;
}

interface RouterOsCounterSample {
  readonly counters: ReadonlyMap<string, RouterOsInterfaceCounters>;
  readonly timestampMs: number;
}

export class RouterOsRateTracker {
  private readonly samples = new Map<string, RouterOsCounterSample>();

  public record(
    equipmentId: string,
    timestamp: Date,
    counters: ReadonlyMap<string, RouterOsInterfaceCounters>,
  ): RouterOsRates {
    const previous = this.samples.get(equipmentId);
    const current = {
      counters: new Map(counters),
      timestampMs: timestamp.getTime(),
    };
    this.samples.set(equipmentId, current);
    if (previous === undefined || current.timestampMs <= previous.timestampMs) return {};

    let rxDelta = 0;
    let txDelta = 0;
    let comparableInterfaces = 0;
    for (const [name, counter] of counters) {
      const prior = previous.counters.get(name);
      if (
        prior === undefined ||
        counter.rxBytes < prior.rxBytes ||
        counter.txBytes < prior.txBytes
      ) {
        continue;
      }
      rxDelta += counter.rxBytes - prior.rxBytes;
      txDelta += counter.txBytes - prior.txBytes;
      comparableInterfaces += 1;
    }
    if (comparableInterfaces === 0) return {};

    const elapsedSeconds = (current.timestampMs - previous.timestampMs) / 1_000;
    return {
      rxBps: Math.floor((rxDelta * 8) / elapsedSeconds),
      txBps: Math.floor((txDelta * 8) / elapsedSeconds),
    };
  }
}
