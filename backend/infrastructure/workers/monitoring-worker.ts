import type { InventoryEquipmentReference, InventoryReader } from '../../application/ports/monitoring/inventory.reader.js';
import type { Clock } from '../../application/ports/clock.port.js';
import type { ObservationPriorityPolicy } from '../../application/ports/monitoring/observation-priority-policy.port.js';
import type { RecordObservationCommand, RecordObservationBatchUseCase } from '../../application/use-cases/monitoring/record-observation-batch.usecase.js';
import type { Observation } from '../../domain/monitoring/observation.js';
import type { CollectorRegistry } from '../monitoring/collector-registry.js';
import type { WorkerExecutionContext, WorkerRoleHandler, WorkerRunResult } from './worker-contracts.js';
import { WorkerRole } from './worker-role.js';

const monitoringCycleWorkId = 'monitoring-collection-cycle';
const defaultClock: Clock = { now: () => new Date() };
const defaultIntervalMs = 60_000;
const preserveAllObservationPriorityPolicy: ObservationPriorityPolicy = {
  select: (observations) => [...observations],
};

type ObservationBatchRecorder = Pick<RecordObservationBatchUseCase, 'execute'>;

export interface MonitoringWorkerDependencies {
  collectors: CollectorRegistry;
  inventory: InventoryReader;
  observationPriorityPolicy?: ObservationPriorityPolicy;
  recordObservations: ObservationBatchRecorder;
}

export interface MonitoringWorkerOptions {
  clock?: Clock;
  intervalMs?: number;
}

export class MonitoringWorker implements WorkerRoleHandler {
  public readonly role = WorkerRole.Monitoring;
  private readonly clock: Clock;
  private readonly intervalMs: number;
  private readonly observationPriorityPolicy: ObservationPriorityPolicy;
  private nextRunAt = 0;

  public constructor(
    private readonly dependencies: MonitoringWorkerDependencies,
    options: MonitoringWorkerOptions = {},
  ) {
    this.clock = options.clock ?? defaultClock;
    this.intervalMs = options.intervalMs ?? defaultIntervalMs;
    this.observationPriorityPolicy =
      dependencies.observationPriorityPolicy ?? preserveAllObservationPriorityPolicy;
    if (!Number.isInteger(this.intervalMs) || this.intervalMs < 1) {
      throw new RangeError('intervalMs debe ser un entero mayor que cero.');
    }
  }

  public async runOnce(context: WorkerExecutionContext): Promise<WorkerRunResult> {
    if (this.clock.now().getTime() < this.nextRunAt) return { outcome: 'idle' };
    try {
      const execution = await context.withLease(monitoringCycleWorkId, (signal) =>
        this.collectCycle(signal),
      );
      return execution.acquired ? execution.value : { outcome: 'skipped' };
    } finally {
      this.nextRunAt = this.clock.now().getTime() + this.intervalMs;
    }
  }

  private async collectCycle(signal: AbortSignal): Promise<WorkerRunResult> {
    const equipment = await this.dependencies.inventory.listEquipment();
    const observationsByCompany = new Map<string, Observation[]>();
    const errors: string[] = [];

    for (const item of equipment) {
      if (signal.aborted) throw signal.reason;
      const itemObservations: Observation[] = [];
      const collectors = this.dependencies.collectors.findAllFor(item);
      for (const collector of collectors) {
        try {
          const observations = await collector.collect(item);
          this.assertObservationsBelongToEquipment(item, observations);
          itemObservations.push(...observations);
        } catch (error) {
          errors.push(`${item.id}: ${this.errorMessage(error)}`);
        }
      }
      const selected = this.observationPriorityPolicy.select(itemObservations);
      const companyObservations = observationsByCompany.get(item.companyId) ?? [];
      companyObservations.push(...selected);
      observationsByCompany.set(item.companyId, companyObservations);
    }

    let recordedObservations = 0;
    for (const [companyId, observations] of observationsByCompany) {
      if (observations.length === 0) continue;
      try {
        await this.dependencies.recordObservations.execute(
          companyId,
          observations.map((observation) => this.toCommand(observation)),
        );
        recordedObservations += observations.length;
      } catch (error) {
        errors.push(`${companyId}: ${this.errorMessage(error)}`);
      }
    }

    if (errors.length > 0) {
      return { error: errors.join('; ').slice(0, 2_000), outcome: 'retried' };
    }
    return recordedObservations > 0 ? { outcome: 'processed' } : { outcome: 'idle' };
  }

  private assertObservationsBelongToEquipment(
    equipment: InventoryEquipmentReference,
    observations: readonly Observation[],
  ): void {
    const foreignObservation = observations.find(
      (observation) => observation.props.equipmentId !== equipment.id,
    );
    if (foreignObservation !== undefined) {
      throw new Error(
        `Collector returned observation for ${foreignObservation.props.equipmentId}`,
      );
    }
  }

  private toCommand(observation: Observation): RecordObservationCommand {
    return {
      equipmentId: observation.props.equipmentId,
      metricType: observation.props.metricType,
      source: observation.props.source,
      timestamp: observation.props.occurredAt,
      unit: observation.props.metricValue.unit,
      value: observation.props.metricValue.value,
    };
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? `${error.name}: ${error.message}` : 'UnknownError';
  }
}
