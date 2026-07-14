export type MetricUnit = 'ms' | 'percent' | 'bytes' | 'celsius' | 'volts' | 'seconds' | 'bps' | 'dBm' | 'dB' | 'count' | 'status';

export class MetricValue {
  private constructor(public readonly value: number, public readonly unit: MetricUnit) {}

  public static create(value: number, unit: MetricUnit): MetricValue {
    if (unit === 'percent' && (value < 0 || value > 100)) {
      throw new Error('Percent metric must be between 0 and 100');
    }
    if (unit === 'ms' && value < 0) {
      throw new Error('Latency metric cannot be negative');
    }
    if ((unit === 'bytes' || unit === 'bps' || unit === 'seconds' || unit === 'count') && value < 0) {
      throw new Error(`${unit} metric cannot be negative`);
    }
    if (unit === 'status' && value !== 0 && value !== 1) {
      throw new Error('Status metric must be 0 (down) or 1 (up)');
    }
    
    // For values like bps or bytes, they should ideally be integers but we won't strictly enforce Math.floor here,
    // as it's just a value object representation, although it's a good practice.
    if ((unit === 'bytes' || unit === 'bps' || unit === 'count' || unit === 'seconds') && !Number.isInteger(value)) {
      value = Math.floor(value);
    }

    return new MetricValue(value, unit);
  }
}
